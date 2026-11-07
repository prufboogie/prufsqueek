import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { setChainForTests, type ChainReader, type Holding } from "@/server/chain";
import { db } from "@/server/db";
import { clearLeaderboardCache } from "@/server/leaderboards";
import { signInAddress } from "@/server/auth";

const STAKING = getAddress("0x50fd1780526c3186a0c037c7622203bc4fb611ca");

/** A fake Sepolia the tests can rearrange: who holds what, levels, burns, blocks. */
export class FakeChain implements ChainReader {
  holdings = new Map<number, Holding>();
  block = 1000;
  apiDown = false;
  rpcDown = false;
  async collection() {
    return { nft: getAddress("0xc4c7982657f00509548f3a3a41db7fa439a6856b"), core: getAddress("0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4"), staking: STAKING, release: "test" };
  }
  give(address: string, tokenIds: number[], opts: { level?: number; custody?: "wallet" | "staking" } = {}) {
    for (const id of tokenIds) this.holdings.set(id, { holder: getAddress(address), custody: opts.custody ?? "wallet", level: opts.level ?? 1 });
  }
  burn(tokenId: number) {
    this.holdings.delete(tokenId);
  }
  async holders(tokenIds: number[]) {
    if (this.rpcDown) {
      const { GameError } = await import("@/server/errors");
      throw new GameError("chain_unavailable", 503, "Sepolia isn't answering right now.");
    }
    const out = new Map<number, Holding>();
    for (const id of tokenIds) {
      const h = this.holdings.get(id);
      if (h) out.set(id, h);
    }
    return out;
  }
  async listWallet(address: Address) {
    if (this.apiDown) return { status: "unavailable" as const };
    const a = getAddress(address);
    return { status: "available" as const, tokens: [...this.holdings].filter(([, h]) => h.holder === a).map(([tokenId, h]) => ({ tokenId, custody: h.custody, level: h.level })) };
  }
  async metadata(tokenId: number) {
    return { name: `Squeek #${tokenId}`, imageUri: "data:image/svg+xml;base64,PHN2Zy8+", attributes: [{ traitType: "Palette", value: "Reactor Red" }] };
  }
  async latestBlock() {
    return this.block;
  }
  async blockHash(n: number): Promise<Hex | null> {
    return n <= this.block ? keccak256(toHex(`block-${n}`)) : null;
  }
  async accountAddress() {
    return getAddress("0xaDD593163e96B5FeD68c11D5E9917351d464F384");
  }
}

export function useFakeChain() {
  const c = new FakeChain();
  setChainForTests(c);
  return c;
}

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE users, wallets, auth_nonces, player_profiles, player_badges, survivors, shelters, shelter_members, shelter_stays, shelter_resources,
    supply_drops, supply_drop_eligibility, reward_vaults, partners, reward_campaigns, rewards, reward_distributions, reward_claims, activity_logs, leaderboard_entries, error_logs RESTART IDENTITY CASCADE`);
  clearLeaderboardCache();
}

let n = 0;
export async function player() {
  n += 1;
  const address = getAddress(`0x${(0xabc000 + n).toString(16).padStart(40, "0")}`);
  const userId = await signInAddress(address);
  return { userId, address };
}

/** Backdates every current membership, so residency rules are met. */
export async function settleAll(hours = 48) {
  await db.$executeRawUnsafe(`UPDATE shelter_members SET joined_at = now() - interval '${hours} hours'`);
}

export async function demoCampaign(units: { title: string; quantity: number }[]) {
  const vault = await db.rewardVault.upsert({ where: { name: "District Vault" }, create: { name: "District Vault" }, update: {} });
  const c = await db.rewardCampaign.create({ data: { vaultId: vault.id, title: "Test", description: "Test", isDemo: true, status: "ACTIVE" } });
  const rewards = [];
  for (const u of units) rewards.push(await db.reward.create({ data: { campaignId: c.id, kind: "COLLECTIBLE", title: u.title, description: "x", quantity: u.quantity, isDemo: true } }));
  return { campaign: c, rewards };
}
