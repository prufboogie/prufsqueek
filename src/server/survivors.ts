/**
 * Survivors are Squeeks. Official fields (name, art, traits, level) come from the contracts. Anything
 * the game adds is labelled as a game stat in the views.
 */
import type { Survivor } from "@prisma/client";
import { getAddress, type Address } from "viem";
import { record } from "./activity";
import { chain, effectiveWallet, type Holding } from "./chain";
import { db, type Tx } from "./db";
import { GameError, logError } from "./errors";
import { walletOf } from "./players";

const METADATA_TTL = 7 * 24 * 3600_000;

/** Ensures a Survivor row exists with art and traits, fetched from tokenURI once and kept. */
export async function ensureSurvivor(tokenId: number, holding?: Holding | null): Promise<Survivor | null> {
  const row = await db.survivor.findUnique({ where: { tokenId } });
  const fresh = row && row.imageUri && Date.now() - row.fetchedAt.getTime() < METADATA_TTL;
  const holdingFields = holding ? { holder: holding.holder, custody: holding.custody, level: holding.level, checkedAt: new Date(), status: "ACTIVE" as const } : {};
  if (fresh) {
    return holding ? db.survivor.update({ where: { tokenId }, data: holdingFields }) : row;
  }
  try {
    const meta = await chain().metadata(tokenId);
    if (!meta) return row;
    const data = { name: meta.name, imageUri: meta.imageUri, attributes: meta.attributes, fetchedAt: new Date(), ...holdingFields };
    return await db.survivor.upsert({ where: { tokenId }, create: { tokenId, level: holding?.level ?? 1, ...data }, update: data });
  } catch (error) {
    await logError("survivors.metadata", error);
    if (row) return holding ? db.survivor.update({ where: { tokenId }, data: holdingFields }) : row;
    // Keep a placeholder so ownership and shelters still work while the art can't be read.
    return db.survivor.create({ data: { tokenId, name: `Squeek #${tokenId}`, level: holding?.level ?? 1, imageUri: "", attributes: [], fetchedAt: new Date(0), ...holdingFields } });
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) await fn(t);
  }));
}

/**
 * Removes a Survivor from its shelter because its owner no longer holds it. If it was the primary,
 * the whole shelter is abandoned. Written in the caller's transaction.
 */
export async function evict(tx: Tx, tokenId: number, reason: string) {
  const m = await tx.shelterMember.findUnique({ where: { tokenId }, include: { shelter: true } });
  if (!m) return;
  if (m.role === "PRIMARY") {
    const members = await tx.shelterMember.findMany({ where: { shelterId: m.shelterId } });
    for (const x of members) {
      await tx.shelterStay.create({ data: { shelterId: m.shelterId, tokenId: x.tokenId, role: x.role, joinedAt: x.joinedAt, reason: x.tokenId === tokenId ? reason : "shelter abandoned" } });
    }
    await tx.shelterMember.deleteMany({ where: { shelterId: m.shelterId } });
    await tx.shelter.update({ where: { id: m.shelterId }, data: { status: "ABANDONED", abandonedAt: new Date(), abandonReason: `Primary Survivor #${tokenId}: ${reason}` } });
    await record(tx, { kind: "shelter.abandoned", message: `${m.shelter.name} was abandoned: its primary, Survivor #${tokenId}, ${reason}.`, userId: m.userId, shelterId: m.shelterId, tokenId, actor: "system" });
    return;
  }
  await tx.shelterStay.create({ data: { shelterId: m.shelterId, tokenId, role: m.role, joinedAt: m.joinedAt, reason } });
  await tx.shelterMember.delete({ where: { tokenId } });
  await record(tx, { kind: "survivor.left", message: `Survivor #${tokenId} left ${m.shelter.name}: ${reason}.`, userId: m.userId, shelterId: m.shelterId, tokenId, actor: "system" });
}

/**
 * Re-checks every resident against the chain and removes the ones their shelter's owner no longer
 * holds. Used on sync, before a write that depends on a shelter, and at every snapshot.
 */
export async function reconcileMembers(where: { userId?: string; shelterId?: string; tokenIds?: number[] } = {}) {
  const members = await db.shelterMember.findMany({
    where: { userId: where.userId, shelterId: where.shelterId, tokenId: where.tokenIds ? { in: where.tokenIds } : undefined },
    include: { user: { include: { wallet: true } } },
  });
  if (members.length === 0) return { removed: 0 };
  const holdings = await chain().holders(members.map((m) => m.tokenId));
  const lost = members.filter((m) => {
    const h = holdings.get(m.tokenId);
    return !h || !m.user.wallet || h.holder !== effectiveWallet(m.user.wallet.address);
  });
  if (lost.length === 0) return { removed: 0 };
  // Primaries last, so a resident leaves with its own reason before an abandonment sweeps the rest.
  lost.sort((a, b) => (a.role === "PRIMARY" ? 1 : 0) - (b.role === "PRIMARY" ? 1 : 0));
  await db.$transaction(async (tx) => {
    for (const m of lost) {
      const h = holdings.get(m.tokenId);
      await tx.survivor.update({ where: { tokenId: m.tokenId }, data: h ? { holder: h.holder, custody: h.custody, level: h.level, checkedAt: new Date() } : { status: "GONE", holder: null, checkedAt: new Date() } });
      await evict(tx, m.tokenId, h ? "is no longer held by the shelter's owner" : "no longer exists (burned in a merge)");
    }
  });
  return { removed: lost.length };
}

export type SyncResult = { source: "api" | "chain"; wallet: Address; tokenIds: number[]; removed: number };

/**
 * Brings a player's Survivors up to date. The official API lists what the wallet holds; Survivors
 * the game thought were theirs but aren't listed are re-read from the chain before anything is changed.
 */
export async function syncPlayer(userId: string): Promise<SyncResult> {
  const address = await walletOf(userId);
  const wallet = effectiveWallet(address);
  const listing = await chain().listWallet(wallet);
  let tokenIds: number[];
  let source: "api" | "chain" = "api";
  if (listing.status === "available") {
    tokenIds = listing.tokens.map((t) => t.tokenId);
    const levels = new Map(listing.tokens.map((t) => [t.tokenId, t]));
    await mapLimit(tokenIds, 6, async (id) => {
      const t = levels.get(id)!;
      await ensureSurvivor(id, { holder: wallet, custody: t.custody === "staking" ? "staking" : "wallet", level: t.level ?? 1 });
    });
    // Anything we previously credited to this wallet that the listing no longer shows gets a chain read.
    const stale = await db.survivor.findMany({ where: { holder: wallet, tokenId: { notIn: tokenIds } }, select: { tokenId: true } });
    if (stale.length) {
      const h = await chain().holders(stale.map((s) => s.tokenId));
      for (const s of stale) {
        const x = h.get(s.tokenId);
        await db.survivor.update({ where: { tokenId: s.tokenId }, data: x ? { holder: x.holder, custody: x.custody, level: x.level, checkedAt: new Date() } : { status: "GONE", holder: null, checkedAt: new Date() } });
        if (x?.holder === wallet) tokenIds.push(s.tokenId);
      }
    }
  } else {
    // The API is down: fall back to what we already know, re-verified on-chain.
    source = "chain";
    const known = await db.survivor.findMany({ where: { OR: [{ holder: wallet }, { membership: { userId } }] }, select: { tokenId: true } });
    const h = await chain().holders(known.map((k) => k.tokenId));
    tokenIds = [];
    for (const k of known) {
      const x = h.get(k.tokenId);
      await db.survivor.update({ where: { tokenId: k.tokenId }, data: x ? { holder: x.holder, custody: x.custody, level: x.level, checkedAt: new Date() } : { status: "GONE", holder: null, checkedAt: new Date() } });
      if (x?.holder === wallet) tokenIds.push(k.tokenId);
    }
  }
  const { removed } = await reconcileMembers({ userId });
  if (tokenIds.length >= 10) {
    await db.$transaction(async (tx) => {
      const { award } = await import("./progression");
      await award(tx, userId, "collector");
    });
  }
  return { source, wallet, tokenIds: tokenIds.sort((a, b) => a - b), removed };
}

/** Fresh chain read: throws unless the player's wallet holds every one of these Survivors right now. */
export async function requireHeld(userId: string, tokenIds: number[]) {
  const wallet = effectiveWallet(await walletOf(userId));
  const holdings = await chain().holders(tokenIds);
  for (const id of tokenIds) {
    const h = holdings.get(id);
    if (!h) throw new GameError("survivor_gone", 404, `Survivor #${id} doesn't exist on-chain. It may have been burned in a merge.`);
    if (h.holder !== wallet) throw new GameError("not_your_survivor", 403, `Survivor #${id} isn't held by your wallet.`);
  }
  for (const id of tokenIds) await ensureSurvivor(id, holdings.get(id));
  return holdings;
}

export function survivorCard(s: Survivor) {
  return {
    tokenId: s.tokenId,
    name: s.name,
    level: s.level,
    custody: s.custody,
    status: s.status,
    attributes: (s.attributes as { traitType: string; value: unknown }[]) ?? [],
    imageUrl: s.imageUri ? `/api/survivors/${s.tokenId}/image` : null,
  };
}

export async function survivorArt(tokenId: number): Promise<string | null> {
  let s = await db.survivor.findUnique({ where: { tokenId } });
  if (!s?.imageUri) s = await ensureSurvivor(tokenId).catch(() => null);
  if (!s?.imageUri || !s.imageUri.startsWith("data:image/svg+xml;base64,")) return null;
  return Buffer.from(s.imageUri.split(",")[1], "base64").toString("utf8");
}

export const sameAddress = (a?: string | null, b?: string | null) => Boolean(a && b && getAddress(a) === getAddress(b));
