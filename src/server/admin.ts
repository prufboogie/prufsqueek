/**
 * Admin. Every action is checked on the server (password session, or a wallet listed in
 * ADMIN_WALLETS), validated, and written to the activity log as an admin action.
 */
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { record } from "./activity";
import { db } from "./db";
import { createDrop, tick } from "./drops";
import { GameError } from "./errors";
import { refreshLeaderboards } from "./leaderboards";
import { isAdmin, sessionUserId } from "./session";
import { shortAddress } from "./players";

export async function adminAllowed() {
  if (await isAdmin()) return true;
  const allow = (process.env.ADMIN_WALLETS ?? "").split(",").map((s) => s.trim()).filter((s) => isAddress(s)).map((s) => getAddress(s));
  if (allow.length === 0) return false;
  const userId = await sessionUserId();
  if (!userId) return false;
  const w = await db.wallet.findUnique({ where: { userId } });
  return Boolean(w && allow.includes(getAddress(w.address)));
}

export async function requireAdmin() {
  if (!(await adminAllowed())) throw new GameError("not_admin", 403, "Admins only.");
}

const KIND = z.enum(["PARTNER_NFT", "WHITELIST", "FREE_MINT", "COLLECTIBLE", "ECOSYSTEM", "OTHER"]);
const date = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Not a date").transform((s) => new Date(s));
const text = (max: number) => z.string().trim().min(1).max(max);

export const adminAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("drop.create"), name: text(60), startsAt: date, endsAt: date,
    minSurvivors: z.number().int().min(1).max(13), minResidencyHours: z.number().int().min(0).max(168),
    ticketRule: z.enum(["PER_SURVIVOR", "FLAT"]), maxWinsPerPlayer: z.number().int().min(1).max(10), kind: z.string().max(30).optional(),
  }),
  z.object({
    action: z.literal("drop.update"), id: z.string(), name: text(60).optional(), startsAt: date.optional(), endsAt: date.optional(),
    minSurvivors: z.number().int().min(1).max(13).optional(), minResidencyHours: z.number().int().min(0).max(168).optional(),
    ticketRule: z.enum(["PER_SURVIVOR", "FLAT"]).optional(), maxWinsPerPlayer: z.number().int().min(1).max(10).optional(),
  }),
  z.object({ action: z.literal("drop.cancel"), id: z.string(), reason: text(200) }),
  z.object({ action: z.literal("drop.endNow"), id: z.string() }),
  z.object({ action: z.literal("tick") }),
  z.object({ action: z.literal("partner.create"), name: text(60), website: z.string().url().max(200).optional().or(z.literal("")), description: z.string().max(500).optional(), isDemo: z.boolean() }),
  z.object({ action: z.literal("partner.update"), id: z.string(), status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE"]).optional(), verified: z.boolean().optional() }),
  z.object({
    action: z.literal("campaign.create"), title: text(80), description: text(600), requirements: z.string().max(400).optional(),
    partnerId: z.string().optional().or(z.literal("")), isDemo: z.boolean(), status: z.enum(["DRAFT", "ACTIVE"]),
  }),
  z.object({ action: z.literal("campaign.update"), id: z.string(), status: z.enum(["DRAFT", "ACTIVE", "ENDED"]) }),
  z.object({ action: z.literal("reward.create"), campaignId: z.string(), kind: KIND, title: text(80), description: text(400), quantity: z.number().int().min(1).max(500) }),
  z.object({ action: z.literal("reward.allocate"), id: z.string(), dropId: z.string(), sort: z.number().int().min(0).max(999).optional() }),
  z.object({ action: z.literal("reward.release"), id: z.string() }),
  z.object({ action: z.literal("reward.withdraw"), id: z.string() }),
  z.object({ action: z.literal("distribution.fulfil"), id: z.string(), note: z.string().max(300).optional() }),
  z.object({ action: z.literal("distribution.void"), id: z.string(), note: text(300) }),
]);

const log = (message: string, extra: { dropId?: string; userId?: string; shelterId?: string } = {}) =>
  record(db, { kind: "admin.action", message, actor: "admin", ...extra });

export async function runAdmin(input: z.infer<typeof adminAction>) {
  switch (input.action) {
    case "drop.create": {
      const open = await db.supplyDrop.findFirst({ where: { status: { in: ["SCHEDULED", "OPEN"] }, endsAt: { gt: input.startsAt }, startsAt: { lt: input.endsAt } } });
      if (open) throw new GameError("overlap", 409, `That window overlaps ${open.name}. Drops run one at a time.`);
      const d = await createDrop({ ...input, createdBy: "admin" });
      await log(`Created ${d.name}.`, { dropId: d.id });
      return d;
    }
    case "drop.update": {
      const d = await db.supplyDrop.findUnique({ where: { id: input.id } });
      if (!d) throw new GameError("drop_not_found", 404, "No such drop.");
      // Rules are fixed once a drop opens, so nobody can move the goalposts mid-drop.
      if (d.status !== "SCHEDULED") throw new GameError("drop_locked", 409, "A drop's rules lock when it opens.");
      const { id, action, ...data } = input;
      const r = await db.supplyDrop.updateMany({ where: { id, status: "SCHEDULED" }, data });
      if (r.count === 0) throw new GameError("drop_locked", 409, "That drop just opened; its rules are locked.");
      await log(`Updated ${d.name} before it opened: ${Object.keys(data).join(", ")}.`, { dropId: id });
      return { ok: true };
    }
    case "drop.cancel": {
      const d = await db.supplyDrop.findUnique({ where: { id: input.id } });
      if (!d) throw new GameError("drop_not_found", 404, "No such drop.");
      return db.$transaction(async (tx) => {
        const r = await tx.supplyDrop.updateMany({ where: { id: input.id, status: { in: ["SCHEDULED", "OPEN"] } }, data: { status: "CANCELLED", cancelReason: input.reason } });
        if (r.count === 0) throw new GameError("drop_locked", 409, "Only a drop that hasn't been snapshotted can be cancelled.");
        await tx.reward.updateMany({ where: { dropId: input.id, status: "ALLOCATED" }, data: { dropId: null, status: "AVAILABLE" } });
        await record(tx, { kind: "drop.cancelled", message: `${d.name} was cancelled: ${input.reason}. Its rewards went back to the vault.`, dropId: d.id, actor: "admin" });
        return { ok: true };
      });
    }
    case "drop.endNow": {
      // Moves the snapshot to now. For test groups; logged publicly on the drop.
      const d = await db.supplyDrop.findUnique({ where: { id: input.id } });
      if (!d) throw new GameError("drop_not_found", 404, "No such drop.");
      const now = new Date();
      const r = await db.supplyDrop.updateMany({ where: { id: input.id, status: { in: ["OPEN", "SCHEDULED"] } }, data: { endsAt: now, startsAt: d.startsAt < now ? d.startsAt : now } });
      if (r.count === 0) throw new GameError("drop_locked", 409, "That drop has already been snapshotted.");
      await record(db, { kind: "drop.ended_early", message: `${d.name}'s snapshot was moved to now by an admin.`, dropId: d.id, actor: "admin" });
      return { log: await tick() };
    }
    case "tick":
      return { log: await tick() };
    case "partner.create": {
      const p = await db.partner.create({ data: { name: input.name, website: input.website || null, description: input.description, isDemo: input.isDemo } });
      await log(`Added partner ${p.name}${p.isDemo ? " (demo)" : ""}.`);
      return p;
    }
    case "partner.update": {
      const p = await db.partner.update({ where: { id: input.id }, data: { status: input.status, verified: input.verified } });
      await log(`Updated partner ${p.name}: ${input.status ?? ""}${input.verified !== undefined ? ` verified=${input.verified}` : ""}.`);
      return p;
    }
    case "campaign.create": {
      const vault = await db.rewardVault.upsert({ where: { name: "District Vault" }, create: { name: "District Vault" }, update: {} });
      if (input.partnerId) {
        const p = await db.partner.findUnique({ where: { id: input.partnerId } });
        if (!p) throw new GameError("partner_not_found", 404, "No such partner.");
        if (!p.isDemo && !p.verified && !input.isDemo) throw new GameError("partner_unverified", 409, "Verify the partnership before running a non-demo campaign under its name.");
      }
      const c = await db.rewardCampaign.create({ data: { vaultId: vault.id, title: input.title, description: input.description, requirements: input.requirements, partnerId: input.partnerId || null, isDemo: input.isDemo, status: input.status } });
      await log(`Created campaign ${c.title}${c.isDemo ? " (demo)" : ""}.`);
      return c;
    }
    case "campaign.update": {
      const c = await db.rewardCampaign.update({ where: { id: input.id }, data: { status: input.status } });
      await log(`Campaign ${c.title} is now ${input.status}.`);
      return c;
    }
    case "reward.create": {
      const c = await db.rewardCampaign.findUnique({ where: { id: input.campaignId } });
      if (!c) throw new GameError("campaign_not_found", 404, "No such campaign.");
      const r = await db.reward.create({ data: { campaignId: c.id, kind: input.kind, title: input.title, description: input.description, quantity: input.quantity, isDemo: c.isDemo } });
      await log(`Added ${r.quantity} × ${r.title} to the vault${r.isDemo ? " (demo)" : ""}.`);
      return r;
    }
    case "reward.allocate": {
      const d = await db.supplyDrop.findUnique({ where: { id: input.dropId } });
      if (!d || !["SCHEDULED", "OPEN"].includes(d.status)) throw new GameError("drop_locked", 409, "Rewards can only be added to a drop before its snapshot.");
      const r = await db.reward.updateMany({ where: { id: input.id, status: "AVAILABLE" }, data: { dropId: d.id, status: "ALLOCATED", sort: input.sort ?? 0 } });
      if (r.count === 0) throw new GameError("reward_unavailable", 409, "That reward isn't available.");
      await log(`Allocated a reward batch to ${d.name}.`, { dropId: d.id });
      return { ok: true };
    }
    case "reward.release": {
      const reward = await db.reward.findUnique({ where: { id: input.id }, include: { drop: true } });
      if (!reward?.drop || !["SCHEDULED", "OPEN"].includes(reward.drop.status)) throw new GameError("drop_locked", 409, "Rewards are locked into a drop once its snapshot is taken.");
      await db.reward.updateMany({ where: { id: input.id, status: "ALLOCATED" }, data: { dropId: null, status: "AVAILABLE" } });
      await log(`Moved ${reward.title} out of ${reward.drop.name}, back to the vault.`, { dropId: reward.drop.id });
      return { ok: true };
    }
    case "reward.withdraw": {
      const r = await db.reward.updateMany({ where: { id: input.id, status: "AVAILABLE" }, data: { status: "WITHDRAWN" } });
      if (r.count === 0) throw new GameError("reward_unavailable", 409, "Only an unallocated reward can be withdrawn.");
      await log("Withdrew a reward batch from the vault.");
      return { ok: true };
    }
    case "distribution.fulfil": {
      return db.$transaction(async (tx) => {
        const r = await tx.rewardDistribution.updateMany({ where: { id: input.id, status: "CLAIMED" }, data: { status: "FULFILLED" } });
        if (r.count === 0) throw new GameError("not_claimed", 409, "Only a claimed reward can be marked delivered.");
        const d = await tx.rewardDistribution.findUniqueOrThrow({ where: { id: input.id }, include: { reward: true } });
        await tx.rewardClaim.update({ where: { distributionId: input.id }, data: { fulfilledAt: new Date(), fulfilmentNote: input.note } });
        await record(tx, { kind: "reward.fulfilled", message: `${d.reward.title} was delivered${input.note ? `: ${input.note}` : "."}`, userId: d.userId, shelterId: d.shelterId, dropId: d.dropId, actor: "admin" });
        return { ok: true };
      });
    }
    case "distribution.void": {
      return db.$transaction(async (tx) => {
        const r = await tx.rewardDistribution.updateMany({ where: { id: input.id, status: { in: ["ALLOCATED", "CLAIMED"] } }, data: { status: "VOID", note: input.note } });
        if (r.count === 0) throw new GameError("not_voidable", 409, "That distribution can't be voided.");
        const d = await tx.rewardDistribution.findUniqueOrThrow({ where: { id: input.id }, include: { reward: true } });
        await record(tx, { kind: "reward.voided", message: `${d.reward.title} allocation was voided: ${input.note}`, userId: d.userId, shelterId: d.shelterId, dropId: d.dropId, actor: "admin" });
        return { ok: true };
      });
    }
  }
}

export async function adminData() {
  await refreshLeaderboards(new Date(), true).catch(() => undefined);
  const dayAgo = new Date(Date.now() - 86400_000);
  const [users, shelters, drops, campaigns, partners, rewards, distributions, activity, errors, counts] = await Promise.all([
    db.user.findMany({ include: { wallet: true, profile: true, _count: { select: { shelters: { where: { status: "ACTIVE" } }, memberships: true } } }, orderBy: { lastSeenAt: "desc" }, take: 200 }),
    db.shelter.findMany({ include: { owner: { include: { wallet: true } }, _count: { select: { members: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.supplyDrop.findMany({ orderBy: { endsAt: "desc" }, take: 40, include: { _count: { select: { eligibility: { where: { eligible: true } }, distributions: true } } } }),
    db.rewardCampaign.findMany({ include: { partner: true }, orderBy: { createdAt: "desc" } }),
    db.partner.findMany({ orderBy: { createdAt: "desc" } }),
    db.reward.findMany({ include: { campaign: true, drop: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.rewardDistribution.findMany({ include: { reward: true, drop: true, shelter: true, claim: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    Promise.all([
      db.user.count(), db.user.count({ where: { lastSeenAt: { gte: dayAgo } } }), db.shelter.count({ where: { status: "ACTIVE" } }), db.shelterMember.count(),
      db.activityLog.count({ where: { kind: { in: ["survivor.stacked", "survivor.moved", "survivor.unstacked"] }, createdAt: { gte: dayAgo } } }),
      db.rewardDistribution.count({ where: { status: "CLAIMED" } }),
    ]),
  ]);
  return {
    stats: { players: counts[0], active24h: counts[1], shelters: counts[2], sheltered: counts[3], stacking24h: counts[4], awaitingDelivery: counts[5] },
    users: users.map((u) => ({ id: u.id, wallet: u.wallet?.address, callsign: u.profile?.callsign, xp: u.profile?.xp ?? 0, shelters: u._count.shelters, sheltered: u._count.memberships, lastSeenAt: u.lastSeenAt.toISOString(), createdAt: u.createdAt.toISOString() })),
    shelters: shelters.map((s) => ({ id: s.id, name: s.name, status: s.status, owner: s.owner.wallet ? shortAddress(s.owner.wallet.address) : "?", primaryTokenId: s.primaryTokenId, population: s._count.members, xp: s.xp, createdAt: s.createdAt.toISOString(), abandonReason: s.abandonReason })),
    drops: drops.map((d) => ({ id: d.id, number: d.number, name: d.name, status: d.status, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString(), minSurvivors: d.minSurvivors, minResidencyHours: d.minResidencyHours, ticketRule: d.ticketRule, maxWinsPerPlayer: d.maxWinsPerPlayer, eligible: d._count.eligibility, winners: d._count.distributions, createdBy: d.createdBy })),
    campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, status: c.status, isDemo: c.isDemo, partner: c.partner?.name ?? null })),
    partners: partners.map((p) => ({ id: p.id, name: p.name, website: p.website, status: p.status, verified: p.verified, isDemo: p.isDemo })),
    rewards: rewards.map((r) => ({ id: r.id, title: r.title, kind: r.kind, quantity: r.quantity, status: r.status, isDemo: r.isDemo, campaign: r.campaign.title, drop: r.drop ? { id: r.drop.id, name: r.drop.name, status: r.drop.status } : null })),
    distributions: distributions.map((d) => ({ id: d.id, drop: d.drop.name, reward: d.reward.title, isDemo: d.reward.isDemo, shelter: d.shelter.name, wallet: d.wallet, status: d.status, claimBy: d.claimBy.toISOString(), claimedAt: d.claim?.claimedAt.toISOString() ?? null, claimWallet: d.claim?.wallet ?? null, note: d.note ?? d.claim?.fulfilmentNote ?? null })),
    activity: activity.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), kind: a.kind, message: a.message, actor: a.actor })),
    errors: errors.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), scope: e.scope, message: e.message })),
  };
}
