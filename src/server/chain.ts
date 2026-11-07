/**
 * Read-only Sepolia access. Nothing here can move, burn, stake or lock a Squeek.
 *
 * Addresses come from the published deployment record (docs.squeekchain.com), checked against the
 * chain: right network, right bytecode, right SqueekCore binding. The official API is used to list a
 * wallet's Squeeks quickly; every decision that matters re-reads ownership from the contracts.
 */
import { createPublicClient, fallback, getAddress, http, isAddress, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import snapshot from "./deployment-snapshot.json";
import { GameError, logError } from "./errors";

const HEADERS = { Accept: "application/json", "User-Agent": "TheLastDistrict/0.1 (community game)" };
const DEPLOYMENT_URL = "https://docs.squeekchain.com/assets/deployments/sepolia.json";
const API = "https://api.squeekchain.com/v1";
const DEPLOYMENT_TTL = 10 * 60_000;
const SAFE_ART = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/;
const MAX_ART = 400_000;

/** ERC-6551 canonical registry and the Tokenbound v3 account proxy. Both verified as deployed on Sepolia. */
export const ERC6551 = {
  registry: "0x000000006551c19487814612e58FE06813775758" as Address,
  implementation: "0x55266d75D1a14E4572138116aF39863Ed6596E7F" as Address,
  salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
};

const nftAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function level(uint256 tokenId) view returns (uint8)",
  "function sqkCore() view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const stakingAbi = parseAbi(["function depositor(address collection, uint256 tokenId) view returns (address)"]);
const registryAbi = parseAbi([
  "function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)",
]);

const Deployment = z.object({
  chainId: z.literal(11155111),
  release: z.string(),
  contracts: z.object({
    SqueekCore: z.object({ address: z.string() }),
    SqueekNFT: z.object({ address: z.string(), runtimeHash: z.string().optional() }),
    SqueekStaking: z.object({ address: z.string() }),
  }).passthrough(),
}).passthrough();

export type Collection = { nft: Address; core: Address; staking: Address; release: string };
export type Holding = { holder: Address; custody: "wallet" | "staking"; level: number };
export type Listed = { tokenId: number; custody: string; level: number | null };
export type Listing = { status: "available"; tokens: Listed[] } | { status: "unavailable" };
export type Metadata = { name: string; imageUri: string; attributes: { traitType: string; value: string | number | boolean }[] };

/** Everything the game reads from outside. Tests swap in their own. */
export interface ChainReader {
  collection(): Promise<Collection>;
  /** Current holder per token. A token missing from the map doesn't exist (never issued, or burned in a merge). */
  holders(tokenIds: number[]): Promise<Map<number, Holding>>;
  listWallet(address: Address): Promise<Listing>;
  metadata(tokenId: number): Promise<Metadata | null>;
  latestBlock(): Promise<number>;
  blockHash(blockNumber: number): Promise<Hex | null>;
  accountAddress(tokenId: number): Promise<Address | null>;
}

function rpcClient(): PublicClient {
  const own = (process.env.SEPOLIA_RPC_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const urls = [...own, "https://sepolia.gateway.tenderly.co", "https://rpc.sepolia.ethpandaops.io", "https://ethereum-sepolia-rpc.publicnode.com"];
  return createPublicClient({
    chain: sepolia,
    transport: fallback(urls.map((u) => http(u, { timeout: 8000, retryCount: 1 }))),
  }) as PublicClient;
}

class SepoliaReader implements ChainReader {
  private client = rpcClient();
  private cached?: { at: number; value: Collection };

  private async record() {
    try {
      const res = await fetch(DEPLOYMENT_URL, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: HEADERS });
      if (res.ok) return Deployment.parse(await res.json());
    } catch {
      // Fall back to the copy taken from the same record.
    }
    return Deployment.parse(snapshot);
  }

  async collection(): Promise<Collection> {
    if (this.cached && Date.now() - this.cached.at < DEPLOYMENT_TTL) return this.cached.value;
    try {
      const record = await this.record();
      const nft = getAddress(record.contracts.SqueekNFT.address);
      const [code, core, chainId] = await Promise.all([
        this.client.getCode({ address: nft }),
        this.client.readContract({ address: nft, abi: nftAbi, functionName: "sqkCore" }),
        this.client.getChainId(),
      ]);
      if (chainId !== 11155111) throw new Error("RPC is not Sepolia");
      const expected = record.contracts.SqueekNFT.runtimeHash;
      if (expected && code && keccak256(code) !== expected) throw new Error("SqueekNFT bytecode doesn't match the deployment record");
      if (getAddress(core) !== getAddress(record.contracts.SqueekCore.address)) throw new Error("SqueekNFT is bound to a different SqueekCore");
      const value = { nft, core: getAddress(core), staking: getAddress(record.contracts.SqueekStaking.address), release: record.release };
      this.cached = { at: Date.now(), value };
      return value;
    } catch (error) {
      await logError("chain.collection", error);
      if (this.cached && Date.now() - this.cached.at < 6 * DEPLOYMENT_TTL) return this.cached.value;
      throw new GameError("chain_unavailable", 503, "The Squeek collection can't be verified on Sepolia right now. Try again in a minute.");
    }
  }

  async holders(tokenIds: number[]): Promise<Map<number, Holding>> {
    const out = new Map<number, Holding>();
    if (tokenIds.length === 0) return out;
    const c = await this.collection();
    const ids = [...new Set(tokenIds)];
    try {
      const results = await this.client.multicall({
        allowFailure: true,
        contracts: ids.flatMap((id) => [
          { address: c.nft, abi: nftAbi, functionName: "ownerOf", args: [BigInt(id)] } as const,
          { address: c.nft, abi: nftAbi, functionName: "level", args: [BigInt(id)] } as const,
        ]),
      });
      const staked: number[] = [];
      ids.forEach((id, i) => {
        const owner = results[i * 2];
        const level = results[i * 2 + 1];
        // A revert on ownerOf means the token doesn't exist: unissued, or burned as a merge donor.
        if (owner.status !== "success" || level.status !== "success") return;
        const holder = getAddress(owner.result as string);
        out.set(id, { holder, custody: "wallet", level: Number(level.result) });
        if (holder === c.staking) staked.push(id);
      });
      if (staked.length) {
        const deps = await this.client.multicall({
          allowFailure: false,
          contracts: staked.map((id) => ({ address: c.staking, abi: stakingAbi, functionName: "depositor", args: [c.nft, BigInt(id)] }) as const),
        });
        staked.forEach((id, i) => {
          const prev = out.get(id)!;
          out.set(id, { ...prev, holder: getAddress(deps[i] as string), custody: "staking" });
        });
      }
      return out;
    } catch (error) {
      await logError("chain.holders", error);
      throw new GameError("chain_unavailable", 503, "Sepolia isn't answering right now, so ownership can't be confirmed. Nothing was changed.");
    }
  }

  async listWallet(address: Address): Promise<Listing> {
    const wallet = address.toLowerCase();
    const found: Listed[] = [];
    let cursor: string | null | undefined;
    const Page = z.object({
      status: z.string(),
      tokens: z.array(z.object({ tokenId: z.string(), custody: z.string(), level: z.number().nullable() }).passthrough()).optional(),
      nextCursor: z.string().nullable().optional(),
    }).passthrough();
    try {
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ limit: "100" });
        if (cursor) q.set("cursor", cursor);
        const res = await fetch(`${API}/accounts/${wallet}?${q}`, { signal: AbortSignal.timeout(10_000), cache: "no-store", headers: HEADERS });
        if (!res.ok && res.status !== 404) throw new Error(`Squeek API ${res.status}`);
        const data = Page.parse(await res.json());
        // "unavailable" means unknown, not empty. Never tell a holder they own nothing because the indexer blinked.
        if (data.status !== "available") return { status: "unavailable" };
        for (const t of data.tokens ?? []) found.push({ tokenId: Number(t.tokenId), custody: t.custody, level: t.level });
        cursor = data.nextCursor;
        if (!cursor) break;
      }
      return { status: "available", tokens: found };
    } catch (error) {
      await logError("chain.listWallet", error);
      return { status: "unavailable" };
    }
  }

  async metadata(tokenId: number): Promise<Metadata | null> {
    const c = await this.collection();
    const uri = await this.client.readContract({ address: c.nft, abi: nftAbi, functionName: "tokenURI", args: [BigInt(tokenId)] });
    const comma = uri.indexOf(",");
    if (!uri.startsWith("data:application/json") || comma < 0) return null;
    const body = uri.slice(comma + 1);
    const text = uri.slice(0, comma).includes("base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
    const raw = z.object({
      name: z.string().max(200).optional(),
      image: z.string().optional(),
      attributes: z.array(z.object({ trait_type: z.string().max(60), value: z.union([z.string().max(120), z.number(), z.boolean()]) })).max(40).optional(),
    }).parse(JSON.parse(text));
    if (!raw.image || !SAFE_ART.test(raw.image) || raw.image.length > MAX_ART) return null;
    return {
      name: raw.name ?? `Squeek #${tokenId}`,
      imageUri: raw.image,
      attributes: (raw.attributes ?? []).map((a) => ({ traitType: a.trait_type, value: a.value })),
    };
  }

  async latestBlock() {
    try {
      return Number(await this.client.getBlockNumber({ cacheTime: 4000 }));
    } catch (error) {
      await logError("chain.latestBlock", error);
      throw new GameError("chain_unavailable", 503, "Sepolia isn't answering right now.");
    }
  }

  async blockHash(blockNumber: number): Promise<Hex | null> {
    try {
      const block = await this.client.getBlock({ blockNumber: BigInt(blockNumber) });
      return block.hash;
    } catch {
      return null;
    }
  }

  async accountAddress(tokenId: number): Promise<Address | null> {
    try {
      const c = await this.collection();
      return await this.client.readContract({
        address: ERC6551.registry, abi: registryAbi, functionName: "account",
        args: [ERC6551.implementation, ERC6551.salt, 11155111n, c.nft, BigInt(tokenId)],
      });
    } catch (error) {
      await logError("chain.accountAddress", error);
      return null;
    }
  }
}

let reader: ChainReader | null = null;
export const chain = (): ChainReader => (reader ??= new SepoliaReader());
/** Test seam. */
export function setChainForTests(r: ChainReader | null) {
  reader = r;
}

/**
 * In development only, lets a throwaway wallet stand in for one that holds Squeeks, so the game can be
 * played without that wallet's keys. "from:to" pairs, comma-separated. Ignored in production.
 */
export function effectiveWallet(address: string): Address {
  const a = getAddress(address);
  if (process.env.NODE_ENV === "production") return a;
  for (const pair of (process.env.DEV_NFT_ALIAS ?? "").split(",")) {
    const [from, to] = pair.split(":").map((s) => s?.trim());
    if (from && to && isAddress(from, { strict: false }) && isAddress(to, { strict: false }) && getAddress(from) === a) return getAddress(to);
  }
  return a;
}
