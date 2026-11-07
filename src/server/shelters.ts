/**
 * Shelters and stacking. Every write: fresh on-chain ownership read, then one transaction that locks
 * the shelter row, re-checks the rules and records the activity. The unique index on a resident's
 * token id is the last line against a Survivor ending up in two shelters.
 */
import type { Shelter, ShelterMember, Survivor } from "@prisma/client";
import { z } from "zod";
import { RULES, THEMES, capacityFor, nextTier, tierFor } from "@/shared/rules";
import { activityView, record } from "./activity";
import { chain } from "./chain";
import { db, isUniqueViolation, type Tx } from "./db";
import { GameError } from "./errors";
import { checkShelterBadges, award } from "./progression";
import { evict, reconcileMembers, requireHeld, survivorCard } from "./survivors";

const NAME = z.string().trim().min(RULES.nameMin, `Shelter names need at least ${RULES.nameMin} characters.`).max(RULES.nameMax, `Shelter names can be at most ${RULES.nameMax} characters.`)
  .regex(/^[\p{L}\p{N} '\-.#&!]+$/u, "Letters, numbers, spaces and ' - . # & ! only.");

export const shelterAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: NAME }),
  z.object({ action: z.literal("theme"), theme: z.string() }),
  z.object({ action: z.literal("stack"), tokenId: z.number().int().min(1).max(9999), move: z.boolean().optional() }),
  z.object({ action: z.literal("unstack"), tokenId: z.number().int().min(1).max(9999) }),
  z.object({ action: z.literal("abandon"), confirm: z.literal(true) }),
]);
export const establishSchema = z.object({ primaryTokenId: z.number().int().min(1).max(9999), name: NAME });

async function lockShelter(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM shelters WHERE id = ${id} FOR UPDATE`;
  const s = await tx.shelter.findUnique({ where: { id }, include: { members: true } });
  if (!s) throw new GameError("shelter_not_found", 404, "That shelter doesn't exist.");
  return s;
}

function ownActive(s: Shelter, userId: string) {
  if (s.ownerId !== userId) throw new GameError("not_your_shelter", 403, "Only the shelter's owner can change it.");
  if (s.status !== "ACTIVE") throw new GameError("shelter_abandoned", 409, "That shelter has been abandoned.");
}

/** Clears a stale membership left by a previous owner. The caller has just proven on-chain that this player holds the token. */
async function clearForeignMembership(tx: Tx, tokenId: number, userId: string) {
  const m = await tx.shelterMember.findUnique({ where: { tokenId } });
  if (m && m.userId !== userId) await evict(tx, tokenId, "changed hands");
}

export async function establishShelter(userId: string, input: z.infer<typeof establishSchema>) {
  const holdings = await requireHeld(userId, [input.primaryTokenId]);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const count = await tx.shelter.count({ where: { ownerId: userId, status: "ACTIVE" } });
      if (count >= RULES.maxShelters) throw new GameError("too_many_shelters", 409, `You can run at most ${RULES.maxShelters} shelters at once.`);
      await clearForeignMembership(tx, input.primaryTokenId, userId);
      const existing = await tx.shelterMember.findUnique({ where: { tokenId: input.primaryTokenId }, include: { shelter: true } });
      if (existing) throw new GameError("already_sheltered", 409, `Survivor #${input.primaryTokenId} is already in ${existing.shelter.name}. Remove it there first.`);
      const shelter = await tx.shelter.create({ data: { name: input.name, ownerId: userId, primaryTokenId: input.primaryTokenId } });
      await tx.shelterMember.create({ data: { shelterId: shelter.id, tokenId: input.primaryTokenId, userId, role: "PRIMARY" } });
      const level = holdings.get(input.primaryTokenId)!.level;
      await record(tx, {
        kind: "shelter.established", message: `Established ${shelter.name}, led by Survivor #${input.primaryTokenId} (${capacityFor(level)} beds).`,
        userId, shelterId: shelter.id, tokenId: input.primaryTokenId,
      });
      await checkShelterBadges(tx, userId);
      return shelter;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new GameError("already_sheltered", 409, `Survivor #${input.primaryTokenId} was just placed in another shelter.`);
    throw error;
  }
}

export async function shelterActionFor(userId: string, shelterId: string, input: z.infer<typeof shelterAction>) {
  switch (input.action) {
    case "rename":
      return db.$transaction(async (tx) => {
        const s = await lockShelter(tx, shelterId);
        ownActive(s, userId);
        await tx.shelter.update({ where: { id: s.id }, data: { name: input.name } });
        await record(tx, { kind: "shelter.renamed", message: `Renamed ${s.name} to ${input.name}.`, userId, shelterId });
      });
    case "theme":
      return db.$transaction(async (tx) => {
        const s = await lockShelter(tx, shelterId);
        ownActive(s, userId);
        const theme = THEMES[input.theme];
        if (!theme) throw new GameError("bad_theme", 400, "That theme doesn't exist.");
        if (tierFor(s.xp).tier < theme.tier) throw new GameError("theme_locked", 403, `${theme.name} unlocks at development tier ${theme.tier}.`);
        await tx.shelter.update({ where: { id: s.id }, data: { theme: input.theme } });
        await record(tx, { kind: "shelter.theme", message: `${s.name} now looks like a ${theme.name}.`, userId, shelterId });
      });
    case "stack":
      return stack(userId, shelterId, input.tokenId, Boolean(input.move));
    case "unstack":
      return unstack(userId, shelterId, input.tokenId);
    case "abandon":
      return db.$transaction(async (tx) => {
        const s = await lockShelter(tx, shelterId);
        ownActive(s, userId);
        for (const m of s.members) await tx.shelterStay.create({ data: { shelterId, tokenId: m.tokenId, role: m.role, joinedAt: m.joinedAt, reason: "shelter disbanded by its owner" } });
        await tx.shelterMember.deleteMany({ where: { shelterId } });
        await tx.shelter.update({ where: { id: shelterId }, data: { status: "ABANDONED", abandonedAt: new Date(), abandonReason: "Disbanded by its owner" } });
        await record(tx, { kind: "shelter.abandoned", message: `Disbanded ${s.name}. ${s.members.length} Survivors are free again.`, userId, shelterId });
      });
  }
}

/** Places a Survivor in a shelter: the seven checks from the design, in order. */
async function stack(userId: string, shelterId: string, tokenId: number, move: boolean) {
  const target = await db.shelter.findUnique({ where: { id: shelterId } });
  if (!target) throw new GameError("shelter_not_found", 404, "That shelter doesn't exist.");
  ownActive(target, userId);
  // 1 + 2: the player holds the Survivor, and still holds the shelter's primary, right now.
  const holdings = await requireHeld(userId, [tokenId, target.primaryTokenId]).catch(async (e) => {
    if (e instanceof GameError && e.message.includes(`#${target.primaryTokenId}`) && target.primaryTokenId !== tokenId) {
      await reconcileMembers({ shelterId });
      throw new GameError("primary_lost", 409, `${target.name}'s primary, Survivor #${target.primaryTokenId}, is no longer in your wallet, so the shelter was abandoned.`);
    }
    throw e;
  });
  const capacity = capacityFor(holdings.get(target.primaryTokenId)!.level);
  try {
    return await db.$transaction(async (tx) => {
      const s = await lockShelter(tx, shelterId);
      ownActive(s, userId);
      await clearForeignMembership(tx, tokenId, userId);
      // 3: not already somewhere.
      const current = await tx.shelterMember.findUnique({ where: { tokenId }, include: { shelter: true } });
      if (current?.shelterId === shelterId) throw new GameError("already_here", 409, `Survivor #${tokenId} is already in ${s.name}.`);
      if (current) {
        if (current.role === "PRIMARY") throw new GameError("is_primary", 409, `Survivor #${tokenId} leads ${current.shelter.name}. A primary can't move; disband that shelter first.`);
        if (!move) throw new GameError("already_sheltered", 409, `Survivor #${tokenId} is in ${current.shelter.name}. Move it instead.`, { fromShelterId: current.shelterId, fromShelter: current.shelter.name });
        const ready = current.joinedAt.getTime() + RULES.moveCooldownMinutes * 60_000;
        if (Date.now() < ready) {
          throw new GameError("move_cooldown", 409, `Survivor #${tokenId} only just arrived in ${current.shelter.name}. It can move again in ${Math.ceil((ready - Date.now()) / 60_000)} min.`);
        }
      }
      // 4: capacity.
      if (s.members.length >= capacity) throw new GameError("shelter_full", 409, `${s.name} is full: ${capacity} beds for a Level ${holdings.get(s.primaryTokenId)!.level} primary.`);
      // 5 + 6: update membership.
      if (current) {
        await tx.shelterStay.create({ data: { shelterId: current.shelterId, tokenId, role: current.role, joinedAt: current.joinedAt, reason: `moved to ${s.name}` } });
        await tx.shelterMember.delete({ where: { tokenId } });
      }
      await tx.shelterMember.create({ data: { shelterId, tokenId, userId, role: "RESIDENT" } });
      // 7: record it.
      await record(tx, {
        kind: current ? "survivor.moved" : "survivor.stacked",
        message: current ? `Moved Survivor #${tokenId} from ${current.shelter.name} to ${s.name}.` : `Survivor #${tokenId} joined ${s.name}.`,
        userId, shelterId, tokenId, data: current ? { from: current.shelterId } : undefined,
      });
      if (s.members.length + 1 === capacity) await award(tx, userId, "full_house");
      return { population: s.members.length + 1, capacity };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new GameError("already_sheltered", 409, `Survivor #${tokenId} was just placed in another shelter.`);
    throw error;
  }
}

async function unstack(userId: string, shelterId: string, tokenId: number) {
  return db.$transaction(async (tx) => {
    const s = await lockShelter(tx, shelterId);
    ownActive(s, userId);
    const m = s.members.find((x) => x.tokenId === tokenId);
    if (!m) throw new GameError("not_here", 404, `Survivor #${tokenId} isn't in ${s.name}.`);
    if (m.role === "PRIMARY") throw new GameError("is_primary", 409, "The primary Survivor holds the shelter together. Disband the shelter to free it.");
    await tx.shelterStay.create({ data: { shelterId, tokenId, role: m.role, joinedAt: m.joinedAt, reason: "removed by the owner" } });
    await tx.shelterMember.delete({ where: { tokenId } });
    await record(tx, { kind: "survivor.unstacked", message: `Survivor #${tokenId} left ${s.name}.`, userId, shelterId, tokenId });
    return { population: s.members.length - 1 };
  });
}

type FullShelter = Shelter & { members: (ShelterMember & { survivor: Survivor })[]; resources: { kind: string; amount: number }[] };

export function shelterView(s: FullShelter, extra?: { ownerName?: string; wallet?: string }) {
  const primary = s.members.find((m) => m.role === "PRIMARY");
  const level = primary?.survivor.level ?? 1;
  const capacity = capacityFor(level);
  const tier = tierFor(s.xp);
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    theme: s.theme,
    ownerId: s.ownerId,
    ownerName: extra?.ownerName,
    wallet: extra?.wallet,
    primaryTokenId: s.primaryTokenId,
    primaryLevel: level,
    capacity,
    population: s.members.length,
    xp: s.xp,
    tier: { ...tier, next: nextTier(s.xp) },
    createdAt: s.createdAt.toISOString(),
    abandonedAt: s.abandonedAt?.toISOString() ?? null,
    abandonReason: s.abandonReason,
    resources: Object.fromEntries(s.resources.map((r) => [r.kind, r.amount])),
    members: [...s.members]
      .sort((a, b) => (a.role === "PRIMARY" ? -1 : b.role === "PRIMARY" ? 1 : a.joinedAt.getTime() - b.joinedAt.getTime()))
      .map((m) => ({ ...survivorCard(m.survivor), role: m.role, joinedAt: m.joinedAt.toISOString() })),
  };
}

const fullInclude = { members: { include: { survivor: true } }, resources: true, owner: { include: { wallet: true, profile: true } } } as const;

export async function myShelters(userId: string) {
  const shelters = await db.shelter.findMany({ where: { ownerId: userId, status: "ACTIVE" }, include: fullInclude, orderBy: { createdAt: "asc" } });
  return shelters.map((s) => shelterView(s));
}

/** Public detail: members, history, drop record, and the shelter's counterfactual ERC-6551 account. */
export async function shelterDetail(id: string) {
  const s = await db.shelter.findUnique({ where: { id }, include: fullInclude });
  if (!s) throw new GameError("shelter_not_found", 404, "That shelter doesn't exist.");
  const [activity, stays, eligibility, wins, account] = await Promise.all([
    db.activityLog.findMany({ where: { shelterId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.shelterStay.findMany({ where: { shelterId: id }, orderBy: { leftAt: "desc" }, take: 40 }),
    db.supplyDropEligibility.findMany({ where: { shelterId: id }, include: { drop: true }, orderBy: { drop: { endsAt: "desc" } }, take: 20 }),
    db.rewardDistribution.findMany({ where: { shelterId: id, status: { not: "VOID" } }, include: { reward: true, drop: true }, orderBy: { createdAt: "desc" } }),
    chain().accountAddress(s.primaryTokenId).catch(() => null),
  ]);
  const ownerName = s.owner.profile?.callsign || (s.owner.wallet ? `${s.owner.wallet.address.slice(0, 6)}…${s.owner.wallet.address.slice(-4)}` : "Unknown");
  return {
    ...shelterView(s, { ownerName, wallet: s.owner.wallet?.address }),
    account: account ? { address: account, standard: "ERC-6551", deployed: false } : null,
    activity: activity.map(activityView),
    pastResidents: stays.map((x) => ({ tokenId: x.tokenId, role: x.role, joinedAt: x.joinedAt.toISOString(), leftAt: x.leftAt.toISOString(), reason: x.reason })),
    drops: eligibility.map((e) => ({ dropId: e.dropId, dropName: e.drop.name, number: e.drop.number, endsAt: e.drop.endsAt.toISOString(), eligible: e.eligible, tickets: e.tickets, reason: e.reason })),
    wins: wins.map((w) => ({ id: w.id, dropId: w.dropId, dropName: w.drop.name, reward: w.reward.title, kind: w.reward.kind, isDemo: w.reward.isDemo, status: w.status })),
  };
}
