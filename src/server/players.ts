import { getAddress, isAddress } from "viem";
import { db } from "./db";
import { GameError } from "./errors";

export function normalizeAddress(address: string) {
  if (!isAddress(address)) throw new GameError("bad_address", 400, "That isn't a wallet address.");
  return getAddress(address);
}

export async function createPlayer(address: string) {
  return db.user.create({ data: { wallet: { create: { address } }, profile: { create: {} } } });
}

export async function walletOf(userId: string) {
  const w = await db.wallet.findUnique({ where: { userId } });
  if (!w) throw new GameError("wallet_required", 403, "Connect a wallet first.");
  return w.address;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Callsign if set, otherwise the short wallet. */
export const displayName = (u: { profile?: { callsign: string | null } | null; wallet?: { address: string } | null }) =>
  u.profile?.callsign || (u.wallet ? shortAddress(u.wallet.address) : "Unknown survivor");
