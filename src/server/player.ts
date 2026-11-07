import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { BADGES, capacityFor } from "@/shared/rules";
import { activityView, record } from "./activity";
import { effectiveWallet } from "./chain";
import { db } from "./db";
import { dropSummary, tickSoon } from "./drops";
import { GameError } from "./errors";
import { shortAddress } from "./players";
import { myShelters } from "./shelters";
import { survivorCard, syncPlayer } from "./survivors";

export async function me(userId: string | null) {
  if (!userId) return { signedIn: false as const };
  const u = await db.user.findUnique({ where: { id: userId }, include: { wallet: true, profile: true, badges: true } });
  if (!u?.wallet) return { signedIn: false as const };
  const alias = effectiveWallet(u.wallet.address);
  return {
    signedIn: true as const,
    userId: u.id,
    wallet: u.wallet.address,
    /** Set only in development when DEV_NFT_ALIAS maps this wallet to another holder. */
    readsAs: alias !== getAddress(u.wallet.address) ? alias : null,
    callsign: u.profile?.callsign ?? null,
    title: u.profile?.title ?? null,
    xp: u.profile?.xp ?? 0,
    badges: u.badges.map((b) => b.key),
  };
}

/** My Survivors: synced with the chain, joined with where each one is sheltered. */
export async function mySurvivors(userId: string, hint: number[] = []) {
  const sync = await syncPlayer(userId, hint);
  const rows = await db.survivor.findMany({
    where: { tokenId: { in: sync.tokenIds } },
    include: { membership: { include: { shelter: true } } },
  });
  const survivors = rows
    .map((s) => ({
      ...survivorCard(s),
      shelter: s.membership ? { id: s.membership.shelterId, name: s.membership.shelter.name, role: s.membership.role, joinedAt: s.membership.joinedAt.toISOString() } : null,
      capacityAsPrimary: capacityFor(s.level),
    }))
    .sort((a, b) => b.level - a.level || a.tokenId - b.tokenId);
  return { source: sync.source, wallet: sync.wallet, removed: sync.removed, survivors };
}

/** The district dashboard: my numbers, the next drop, and what's happening. */
export async function districtOverview(userId: string | null) {
  await tickSoon();
  const [next, globalActivity, totals] = await Promise.all([
    db.supplyDrop.findFirst({ where: { status: { in: ["OPEN", "SCHEDULED", "SNAPSHOT"] } }, orderBy: { endsAt: "asc" }, include: { rewards: true } }),
    db.activityLog.findMany({ where: { kind: { in: ["shelter.established", "drop.won", "drop.snapshot", "drop.opened", "drop.drawn", "shelter.abandoned"] } }, orderBy: { createdAt: "desc" }, take: 12 }),
    Promise.all([
      db.wallet.count(),
      db.shelter.count({ where: { status: "ACTIVE" } }),
      db.shelterMember.count(),
      db.supplyDrop.count({ where: { status: "DRAWN" } }),
    ]),
  ]);
  const district = { players: totals[0], shelters: totals[1], sheltered: totals[2], dropsDrawn: totals[3] };
  const nextDrop = next ? { ...dropSummary(next), rewardUnits: next.rewards.reduce((s, r) => s + r.quantity, 0) } : null;
  if (!userId) return { district, nextDrop, activity: globalActivity.map(activityView), mine: null };

  const [shelters, myActivity, unclaimed, held] = await Promise.all([
    myShelters(userId),
    db.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.rewardDistribution.count({ where: { userId, status: "ALLOCATED" } }),
    db.wallet.findUnique({ where: { userId } }).then((w) => (w ? db.survivor.count({ where: { holder: effectiveWallet(w.address), status: "ACTIVE" } }) : 0)),
  ]);
  return {
    district, nextDrop, activity: globalActivity.map(activityView),
    mine: {
      survivors: held,
      shelters: shelters.length,
      sheltered: shelters.reduce((s, x) => s + x.population, 0),
      capacity: shelters.reduce((s, x) => s + x.capacity, 0),
      unclaimed,
      shelterList: shelters,
      activity: myActivity.map(activityView),
    },
  };
}

export const profileSchema = z.object({
  callsign: z.string().trim().max(24).regex(/^[\p{L}\p{N} _\-.]*$/u, "Letters, numbers, spaces, _ - . only.").optional(),
  title: z.string().nullable().optional(),
});

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const badges = await db.playerBadge.findMany({ where: { userId } });
  if (input.title && !badges.some((b) => b.key === input.title)) throw new GameError("title_locked", 403, "Earn that badge first to use its title.");
  await db.playerProfile.upsert({
    where: { userId },
    create: { userId, callsign: input.callsign || null, title: input.title ?? null },
    update: { ...(input.callsign !== undefined ? { callsign: input.callsign || null } : {}), ...(input.title !== undefined ? { title: input.title } : {}) },
  });
  await record(db, { kind: "profile.updated", message: "Updated their profile.", userId });
}

/** A public profile by wallet address. Only recorded facts. */
export async function publicProfile(address: string) {
  if (!isAddress(address)) throw new GameError("bad_address", 400, "That isn't a wallet address.");
  const w = await db.wallet.findUnique({ where: { address: getAddress(address) }, include: { user: { include: { profile: true, badges: true } } } });
  if (!w) throw new GameError("player_not_found", 404, "No survivor has signed in with that wallet yet.");
  const userId = w.userId;
  const [shelters, eligible, wins, activity, held, joined] = await Promise.all([
    myShelters(userId),
    db.supplyDropEligibility.findMany({ where: { userId }, include: { drop: true }, orderBy: { drop: { endsAt: "desc" } } }),
    db.rewardDistribution.findMany({ where: { userId, status: { not: "VOID" } }, include: { reward: true, drop: true, shelter: true }, orderBy: { createdAt: "desc" } }),
    db.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.survivor.count({ where: { holder: effectiveWallet(w.address), status: "ACTIVE" } }),
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
  ]);
  const dropsQualified = new Set(eligible.filter((e) => e.eligible).map((e) => e.dropId)).size;
  const dropsEntered = new Set(eligible.map((e) => e.dropId)).size;
  const p = w.user.profile;
  return {
    wallet: w.address,
    name: p?.callsign || shortAddress(w.address),
    callsign: p?.callsign ?? null,
    title: p?.title ? BADGES[p.title]?.name ?? null : null,
    xp: p?.xp ?? 0,
    joinedAt: joined?.createdAt.toISOString(),
    stats: {
      survivors: held,
      shelters: shelters.length,
      sheltered: shelters.reduce((s, x) => s + x.population, 0),
      dropsEntered,
      dropsQualified,
      rewards: wins.length,
    },
    badges: Object.entries(BADGES).map(([key, b]) => ({ key, ...b, earnedAt: w.user.badges.find((x) => x.key === key)?.earnedAt.toISOString() ?? null })),
    shelters,
    drops: eligible.map((e) => ({ dropId: e.dropId, name: e.drop.name, number: e.drop.number, shelterName: e.shelterName, eligible: e.eligible, tickets: e.tickets, at: e.drop.endsAt.toISOString() })),
    rewards: wins.map((x) => ({ id: x.id, reward: x.reward.title, isDemo: x.reward.isDemo, dropName: x.drop.name, dropId: x.dropId, shelterName: x.shelter.name, status: x.status })),
    activity: activity.map(activityView),
  };
}

/** One Survivor's public page: its official card, where it lives, and its history in the game. */
export async function survivorDetail(tokenId: number) {
  const { ensureSurvivor } = await import("./survivors");
  const s = await ensureSurvivor(tokenId);
  if (!s) throw new GameError("survivor_not_found", 404, "That Squeek can't be read right now.");
  const [m, stays, activity, drops, holderUser] = await Promise.all([
    db.shelterMember.findUnique({ where: { tokenId }, include: { shelter: true } }),
    db.shelterStay.findMany({ where: { tokenId }, include: { shelter: true }, orderBy: { leftAt: "desc" }, take: 30 }),
    db.activityLog.findMany({ where: { tokenId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.supplyDropEligibility.findMany({ where: { counted: { has: tokenId } }, include: { drop: true }, orderBy: { drop: { endsAt: "desc" } } }),
    s.holder ? db.wallet.findFirst({ where: { address: s.holder } }) : null,
  ]);
  const daysSheltered = Math.floor(
    (stays.reduce((sum, x) => sum + (x.leftAt.getTime() - x.joinedAt.getTime()), 0) + (m ? Date.now() - m.joinedAt.getTime() : 0)) / 86400_000,
  );
  return {
    ...survivorCard(s),
    holder: s.holder,
    holderPlayer: holderUser ? holderUser.address : null,
    checkedAt: s.checkedAt?.toISOString() ?? null,
    status: m ? (m.role === "PRIMARY" ? "Leading a shelter" : "Sheltered") : s.status === "GONE" ? "Gone (burned in a merge)" : "Unassigned",
    shelter: m ? { id: m.shelterId, name: m.shelter.name, role: m.role, joinedAt: m.joinedAt.toISOString() } : null,
    capacityAsPrimary: capacityFor(s.level),
    gameStats: {
      dropsCounted: drops.length,
      daysSheltered,
      sheltersLived: new Set([...stays.map((x) => x.shelterId), ...(m ? [m.shelterId] : [])]).size,
    },
    history: stays.map((x) => ({ shelterId: x.shelterId, shelterName: x.shelter.name, role: x.role, joinedAt: x.joinedAt.toISOString(), leftAt: x.leftAt.toISOString(), reason: x.reason })),
    activity: activity.map(activityView),
    drops: drops.map((e) => ({ dropId: e.dropId, name: e.drop.name, number: e.drop.number, shelterName: e.shelterName })),
  };
}
