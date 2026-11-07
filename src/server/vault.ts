/**
 * The reward vault, claims and the public drop record. Demo rewards are always flagged as demo, and
 * a partner is shown as a partner only once an admin has marked it verified.
 */
import type { Reward, RewardCampaign, Partner } from "@prisma/client";
import { activityView, record } from "./activity";
import { db } from "./db";
import { dropSummary, tickSoon } from "./drops";
import { GameError } from "./errors";
import { walletOf } from "./players";

export const KIND_LABEL: Record<string, string> = {
  PARTNER_NFT: "Partner NFT", WHITELIST: "Whitelist spot", FREE_MINT: "Free mint", COLLECTIBLE: "Digital collectible", ECOSYSTEM: "Ecosystem reward", OTHER: "Other",
};

const rewardView = (r: Reward & { campaign?: RewardCampaign & { partner: Partner | null } }) => ({
  id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind], title: r.title, description: r.description, quantity: r.quantity,
  isDemo: r.isDemo, status: r.status, dropId: r.dropId,
  campaign: r.campaign ? { id: r.campaign.id, title: r.campaign.title, isDemo: r.campaign.isDemo } : null,
  source: r.campaign?.partner
    ? { name: r.campaign.partner.name, verified: r.campaign.partner.verified, isDemo: r.campaign.partner.isDemo, website: r.campaign.partner.verified ? r.campaign.partner.website : null }
    : { name: "The Last District", verified: true, isDemo: r.isDemo, website: null },
});

export async function vaultView() {
  await tickSoon();
  const include = { campaign: { include: { partner: true } } } as const;
  const [available, upcoming, distributions, campaigns] = await Promise.all([
    db.reward.findMany({ where: { status: "AVAILABLE", quantity: { gt: 0 }, campaign: { status: "ACTIVE" } }, include, orderBy: { createdAt: "asc" } }),
    db.reward.findMany({ where: { status: "ALLOCATED" }, include: { ...include, drop: true }, orderBy: { drop: { endsAt: "asc" } } }),
    db.rewardDistribution.findMany({ where: { status: { not: "VOID" } }, include: { reward: true, drop: true, shelter: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.rewardCampaign.findMany({ where: { status: { in: ["ACTIVE", "ENDED"] } }, include: { partner: true, _count: { select: { rewards: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    available: available.map(rewardView),
    upcoming: upcoming.map((r) => ({ ...rewardView(r), drop: r.drop ? { id: r.drop.id, name: r.drop.name, number: r.drop.number, endsAt: r.drop.endsAt.toISOString() } : null })),
    distributions: distributions.map((d) => ({
      id: d.id, dropId: d.dropId, dropName: d.drop.name, dropNumber: d.drop.number, reward: d.reward.title, kind: d.reward.kind, isDemo: d.reward.isDemo,
      shelterId: d.shelterId, shelterName: d.shelter.name, wallet: d.wallet, status: d.status, at: d.createdAt.toISOString(),
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id, title: c.title, description: c.description, requirements: c.requirements, status: c.status, isDemo: c.isDemo,
      partner: c.partner ? { name: c.partner.name, verified: c.partner.verified, isDemo: c.partner.isDemo, website: c.partner.verified ? c.partner.website : null } : null,
    })),
  };
}

/** A winner claims. Exactly once: the claim row is unique per distribution and the status moves by compare-and-set. */
export async function claimReward(userId: string, distributionId: string) {
  const wallet = await walletOf(userId);
  return db.$transaction(async (tx) => {
    const d = await tx.rewardDistribution.findUnique({ where: { id: distributionId }, include: { reward: true, drop: true } });
    if (!d || d.userId !== userId) throw new GameError("not_your_reward", 404, "That reward isn't yours to claim.");
    if (d.status === "CLAIMED" || d.status === "FULFILLED") throw new GameError("already_claimed", 409, "You've already claimed this reward.");
    if (d.status !== "ALLOCATED") throw new GameError("not_claimable", 409, `This reward is ${d.status.toLowerCase()} and can't be claimed.`);
    if (d.claimBy < new Date()) throw new GameError("claim_expired", 409, "The claim window for this reward has closed.");
    const moved = await tx.rewardDistribution.updateMany({ where: { id: d.id, status: "ALLOCATED" }, data: { status: "CLAIMED" } });
    if (moved.count === 0) throw new GameError("already_claimed", 409, "You've already claimed this reward.");
    const claim = await tx.rewardClaim.create({ data: { distributionId: d.id, userId, wallet } });
    await record(tx, { kind: "reward.claimed", message: `Claimed ${d.reward.title}${d.reward.isDemo ? " (demo)" : ""} from ${d.drop.name}. Delivery goes to ${wallet.slice(0, 6)}…${wallet.slice(-4)}.`, userId, shelterId: d.shelterId, dropId: d.dropId });
    return claim;
  });
}

export async function myRewards(userId: string) {
  const rows = await db.rewardDistribution.findMany({ where: { userId }, include: { reward: true, drop: true, shelter: true, claim: true }, orderBy: { createdAt: "desc" } });
  return rows.map((d) => ({
    id: d.id, dropId: d.dropId, dropName: d.drop.name, dropNumber: d.drop.number, reward: d.reward.title, kind: d.reward.kind, kindLabel: KIND_LABEL[d.reward.kind],
    description: d.reward.description, isDemo: d.reward.isDemo, shelterId: d.shelterId, shelterName: d.shelter.name, ticket: d.ticket, status: d.status,
    claimBy: d.claimBy.toISOString(), claimedAt: d.claim?.claimedAt.toISOString() ?? null, fulfilledAt: d.claim?.fulfilledAt?.toISOString() ?? null, note: d.claim?.fulfilmentNote ?? null,
  }));
}

/** Everything published about one drop, including what's needed to re-run the draw. */
export async function dropDetail(id: string, userId: string | null) {
  await tickSoon();
  const d = await db.supplyDrop.findUnique({ where: { id }, include: { rewards: { include: { campaign: { include: { partner: true } } }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }, { id: "asc" }] } } });
  if (!d) throw new GameError("drop_not_found", 404, "No such supply drop.");
  const [eligibility, distributions, activity] = await Promise.all([
    db.supplyDropEligibility.findMany({ where: { dropId: id }, orderBy: [{ eligible: "desc" }, { tickets: "desc" }, { shelterId: "asc" }] }),
    db.rewardDistribution.findMany({ where: { dropId: id }, include: { reward: true, shelter: true }, orderBy: { slot: "asc" } }),
    db.activityLog.findMany({ where: { dropId: id, actor: { in: ["system", "admin"] } }, orderBy: { createdAt: "asc" }, take: 30 }),
  ]);
  const revealed = d.status === "DRAWN";
  // Before the snapshot, show where the player's shelters stand right now, by the published rules.
  let preview: unknown = null;
  if (userId && (d.status === "OPEN" || d.status === "SCHEDULED")) preview = await previewEligibility(userId, d);
  return {
    ...dropSummary(d),
    rewards: d.rewards.map((r) => ({ ...rewardView(r), won: distributions.filter((x) => x.rewardId === r.id).length })),
    rewardUnits: d.status === "DRAWN" ? (d.rewardSlots ?? 0) : d.rewards.reduce((s, r) => s + r.quantity, 0),
    eligibleCount: eligibility.filter((e) => e.eligible).length,
    eligibility: eligibility.map((e) => ({
      shelterId: e.shelterId, shelterName: e.shelterName, wallet: e.wallet, eligible: e.eligible, tickets: e.tickets, ticketStart: e.ticketStart,
      counted: e.counted, excluded: e.excluded, reason: e.reason, mine: userId === e.userId,
    })),
    winners: distributions.map((w) => ({
      id: w.id, slot: w.slot, ticket: w.ticket, shelterId: w.shelterId, shelterName: w.shelter.name, wallet: w.wallet, reward: w.reward.title,
      kind: w.reward.kind, isDemo: w.reward.isDemo, status: w.status, mine: userId === w.userId,
    })),
    fairness: {
      seedHash: d.seedHash,
      seed: revealed ? d.seed : null,
      snapshotAt: d.snapshotAt?.toISOString() ?? null,
      snapshotBlock: d.snapshotBlock,
      snapshotHash: d.snapshotHash,
      entropyBlock: d.entropyBlock,
      entropyBlockHash: d.entropyBlockHash,
      randomness: d.randomness,
      slots: d.rewardSlots,
    },
    timeline: activity.map(activityView),
    preview,
  };
}

/** What the snapshot would say if it were taken now. A guide only; the snapshot itself re-reads the chain. */
async function previewEligibility(userId: string, d: { endsAt: Date; minSurvivors: number; minResidencyHours: number; ticketRule: string }) {
  const cutoff = new Date(d.endsAt.getTime() - d.minResidencyHours * 3600_000);
  const shelters = await db.shelter.findMany({ where: { ownerId: userId, status: "ACTIVE" }, include: { members: true } });
  return shelters.map((s) => {
    const settled = s.members.filter((m) => m.joinedAt <= cutoff).length;
    const pending = s.members.length - settled;
    const ok = settled >= d.minSurvivors;
    return {
      shelterId: s.id, name: s.name, population: s.members.length, settled, pending, onTrack: ok,
      tickets: ok ? (d.ticketRule === "PER_SURVIVOR" ? settled : 1) : 0,
      note: ok
        ? `${settled} Survivors will count if they stay.`
        : s.members.length >= d.minSurvivors
          ? `${pending} Survivor${pending === 1 ? "" : "s"} arrived too recently to count. Survivors must be in place by ${cutoff.toISOString().slice(0, 16).replace("T", " ")} UTC.`
          : `Needs ${d.minSurvivors - s.members.length} more Survivor${d.minSurvivors - s.members.length === 1 ? "" : "s"}, in place by ${cutoff.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    };
  });
}

export async function dropsIndex(userId: string | null) {
  await tickSoon();
  const [current, history] = await Promise.all([
    db.supplyDrop.findFirst({ where: { status: { in: ["OPEN", "SCHEDULED", "SNAPSHOT"] } }, orderBy: { endsAt: "asc" }, include: { rewards: true } }),
    db.supplyDrop.findMany({ where: { status: { in: ["DRAWN", "CANCELLED"] } }, orderBy: { endsAt: "desc" }, take: 30, include: { _count: { select: { distributions: true } }, eligibility: { where: { eligible: true }, select: { id: true } } } }),
  ]);
  const mine = userId ? await db.supplyDropEligibility.findMany({ where: { userId }, select: { dropId: true, eligible: true, tickets: true } }) : [];
  return {
    current: current ? { ...dropSummary(current), rewardUnits: current.rewards.reduce((s, r) => s + r.quantity, 0), rewards: current.rewards.map((r) => ({ title: r.title, kind: r.kind, quantity: r.quantity, isDemo: r.isDemo })) } : null,
    history: history.map((h) => ({
      ...dropSummary(h), eligibleCount: h.eligibility.length, winners: h._count.distributions,
      mine: mine.filter((m) => m.dropId === h.id).reduce((s, m) => ({ eligible: s.eligible || m.eligible, tickets: s.tickets + m.tickets }), { eligible: false, tickets: 0 }),
    })),
  };
}
