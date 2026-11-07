import { randomBytes } from "node:crypto";
import { createPublicClient, http, verifyMessage } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import { signInMessage } from "@/shared/auth-message";
import { record } from "./activity";
import { db } from "./db";
import { GameError } from "./errors";
import { createPlayer, normalizeAddress } from "./players";

const NONCE_TTL_MS = 5 * 60_000;

export const verifySchema = z.object({ address: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), nonce: z.string().min(16).max(64) });

export async function issueNonce() {
  await db.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const nonce = randomBytes(16).toString("hex");
  await db.authNonce.create({ data: { nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) } });
  return nonce;
}

/** Proves control of a wallet with a signed message, then returns that wallet's player, creating one the first time. */
export async function verifyWallet(input: z.infer<typeof verifySchema>, host: string) {
  const address = normalizeAddress(input.address);
  // Delete-to-claim: a nonce works exactly once.
  const claimed = await db.authNonce.deleteMany({ where: { nonce: input.nonce, expiresAt: { gte: new Date() } } });
  if (claimed.count === 0) throw new GameError("bad_nonce", 400, "That sign-in request expired. Try again.");
  const message = signInMessage(address, input.nonce, host);
  const signature = input.signature as `0x${string}`;
  let valid = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!valid) {
    // Smart-contract wallets (ERC-1271) verify on-chain.
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URLS?.split(",")[0]?.trim() || "https://sepolia.gateway.tenderly.co") });
    valid = await client.verifyMessage({ address, message, signature }).catch(() => false);
  }
  if (!valid) throw new GameError("bad_signature", 401, "That signature doesn't match the wallet.");
  return signInAddress(address);
}

/** Finds or creates the player for a proven address. */
export async function signInAddress(address: string) {
  const existing = await db.wallet.findUnique({ where: { address } });
  if (existing) {
    await db.user.update({ where: { id: existing.userId }, data: { lastSeenAt: new Date() } });
    return existing.userId;
  }
  try {
    const user = await createPlayer(address);
    await record(db, { kind: "player.joined", message: "Arrived in the district.", userId: user.id });
    return user.id;
  } catch {
    // Two first sign-ins at once: the other one created it.
    const w = await db.wallet.findUniqueOrThrow({ where: { address } });
    return w.userId;
  }
}
