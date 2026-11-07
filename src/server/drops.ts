/**
 * Supply drops: schedule → open → snapshot → draw. Each transition is a compare-and-set on the
 * drop's status, so two schedulers running at once can't double-snapshot or double-draw.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { SupplyDrop } from "@prisma/client";
import { getAddress, type Hex } from "viem";
import { draw, randomnessOf, seedHashOf, snapshotHash, type SnapshotEntry } from "@/shared/fairness";
import { DROP_NAMES, RULES, describeRules, playerXpForDrop, shelterXpForDrop } from "@/shared/rules";
import { record } from "./activity";
import { chain, effectiveWallet } from "./chain";
import { db } from "./db";
import { GameError, logError } from "./errors";
import { award } from "./progression";
import { evict } from "./survivors";

// ── Seed custody ────────────────────────────────────────────────────────────
function seedKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update("last-district/seed-key").digest();
}
export function sealSeed(seed: Hex) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", seedKey(), iv);
  const body = Buffer.concat([c.update(seed, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
export function openSeed(sealed: string): Hex {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", seedKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8") as Hex;
}
export function newSeed() {
  const seed = `0x${randomBytes(32).toString("hex")}` as Hex;
  return { seedHash: seedHashOf(seed), seedSealed: sealSeed(seed) };
}

// ── Scheduling ──────────────────────────────────────────────────────────────
const intervalHours = () => Number(process.env.DROP_INTERVAL_HOURS) || RULES.dropIntervalHours;

export type DropInput = {
  name: string; startsAt: Date; endsAt: Date; minSurvivors: number; minResidencyHours: number;
  ticketRule: "PER_SURVIVOR" | "FLAT"; maxWinsPerPlayer: number; kind?: string; createdBy?: string;
};

export async function createDrop(input: DropInput) {
  if (input.endsAt <= input.startsAt) throw new GameError("bad_window", 400, "A drop has to end after it starts.");
  const drop = await db.supplyDrop.create({ data: { ...input, kind: input.kind ?? "standard", createdBy: input.createdBy ?? "scheduler", ...newSeed() } });
  await record(db, {
    kind: "drop.scheduled", message: `${drop.name} scheduled: snapshot ${drop.endsAt.toISOString().slice(0, 16).replace("T", " ")} UTC. Seed commitment ${drop.seedHash.slice(0, 10)}… published.`,
    dropId: drop.id, actor: input.createdBy === "scheduler" ? "system" : "admin",
  });
  return drop;
}

/** Keeps exactly one upcoming drop on the calendar, every `DROP_INTERVAL_HOURS`. */
export async function ensureSchedule(now = new Date()) {
  const upcoming = await db.supplyDrop.count({ where: { status: { in: ["SCHEDULED", "OPEN"] } } });
  if (upcoming > 0) return null;
  const last = await db.supplyDrop.findFirst({ where: { status: { not: "CANCELLED" } }, orderBy: { endsAt: "desc" } });
  const startsAt = last && last.endsAt > now ? last.endsAt : now;
  const endsAt = new Date(startsAt.getTime() + intervalHours() * 3600_000);
  const n = (await db.supplyDrop.count()) + 1;
  return createDrop({
    name: `${DROP_NAMES[(n - 1) % DROP_NAMES.length]}`, startsAt, endsAt,
    minSurvivors: RULES.defaultMinSurvivors, minResidencyHours: RULES.defaultMinResidencyHours, ticketRule: "PER_SURVIVOR", maxWinsPerPlayer: 1,
  });
}

// ── Snapshot ────────────────────────────────────────────────────────────────
type Excluded = { tokenId: number; reason: string };

/** Freezes eligibility. Reads every resident's holder from Sepolia once, then writes it all in one transaction. */
export async function takeSnapshot(drop: SupplyDrop) {
  const cutoff = new Date(drop.endsAt.getTime() - drop.minResidencyHours * 3600_000);
  const shelters = await db.shelter.findMany({
    where: { status: "ACTIVE" },
    include: { members: true, owner: { include: { wallet: true } } },
    orderBy: { id: "asc" },
  });
  const allTokens = shelters.flatMap((s) => s.members.map((m) => m.tokenId));
  const [holdings, block] = await Promise.all([chain().holders(allTokens), chain().latestBlock()]);

  const rows: { shelterId: string; userId: string; wallet: string; name: string; eligible: boolean; tickets: number; counted: number[]; excluded: Excluded[]; reason: string }[] = [];
  const lost: { tokenId: number; reason: string }[] = [];
  for (const s of shelters) {
    if (!s.owner.wallet) continue;
    const owner = effectiveWallet(s.owner.wallet.address);
    const counted: number[] = [];
    const excluded: Excluded[] = [];
    let primaryHeld = true;
    for (const m of s.members) {
      const h = holdings.get(m.tokenId);
      if (!h) {
        excluded.push({ tokenId: m.tokenId, reason: "burned in a merge" });
        lost.push({ tokenId: m.tokenId, reason: "no longer exists (burned in a merge)" });
        if (m.role === "PRIMARY") primaryHeld = false;
      } else if (h.holder !== owner) {
        excluded.push({ tokenId: m.tokenId, reason: "not held by the owner at the snapshot" });
        lost.push({ tokenId: m.tokenId, reason: "is no longer held by the shelter's owner" });
        if (m.role === "PRIMARY") primaryHeld = false;
      } else if (m.joinedAt > cutoff) {
        excluded.push({ tokenId: m.tokenId, reason: `joined less than ${drop.minResidencyHours} h before the snapshot` });
      } else {
        counted.push(m.tokenId);
      }
    }
    counted.sort((a, b) => a - b);
    let eligible = false;
    let reason: string;
    if (!primaryHeld) reason = "The primary Survivor wasn't held by the owner at the snapshot.";
    else if (counted.length < drop.minSurvivors) reason = `${counted.length} of ${drop.minSurvivors} Survivors counted.`;
    else {
      eligible = true;
      reason = `${counted.length} Survivors counted (minimum ${drop.minSurvivors}).`;
    }
    const tickets = eligible ? (drop.ticketRule === "PER_SURVIVOR" ? counted.length : 1) : 0;
    rows.push({ shelterId: s.id, userId: s.ownerId, wallet: getAddress(s.owner.wallet.address), name: s.name, eligible, tickets, counted, excluded, reason });
  }

  const entries: SnapshotEntry[] = rows.filter((r) => r.eligible).map((r) => ({ shelterId: r.shelterId, wallet: r.wallet, tickets: r.tickets }));
  const hash = snapshotHash(drop.id, entries);
  const starts = new Map<string, number>();
  let cursor = 0;
  for (const e of [...entries].sort((a, b) => (a.shelterId < b.shelterId ? -1 : 1))) {
    starts.set(e.shelterId, cursor);
    cursor += e.tickets;
  }

  return db.$transaction(async (tx) => {
    const moved = await tx.supplyDrop.updateMany({
      where: { id: drop.id, status: "OPEN" },
      data: { status: "SNAPSHOT", snapshotAt: new Date(), snapshotHash: hash, snapshotBlock: block, totalTickets: cursor, entropyBlock: block + RULES.entropyDelayBlocks },
    });
    if (moved.count === 0) return false;
    for (const r of rows) {
      await tx.supplyDropEligibility.create({
        data: {
          dropId: drop.id, shelterId: r.shelterId, userId: r.userId, wallet: r.wallet, shelterName: r.name, eligible: r.eligible,
          tickets: r.tickets, counted: r.counted, excluded: r.excluded, reason: r.reason, ticketStart: r.eligible ? starts.get(r.shelterId) : null,
        },
      });
      if (!r.eligible) continue;
      await tx.shelter.update({ where: { id: r.shelterId }, data: { xp: { increment: shelterXpForDrop(r.counted.length) } } });
      for (const [kind, amount] of [["rations", 1], ["water", r.counted.length]] as const) {
        await tx.shelterResource.upsert({ where: { shelterId_kind: { shelterId: r.shelterId, kind } }, create: { shelterId: r.shelterId, kind, amount }, update: { amount: { increment: amount } } });
      }
      await tx.playerProfile.upsert({ where: { userId: r.userId }, create: { userId: r.userId, xp: playerXpForDrop(r.tickets) }, update: { xp: { increment: playerXpForDrop(r.tickets) } } });
      await record(tx, { kind: "drop.qualified", message: `${r.name} qualified for ${drop.name} with ${r.tickets} ticket${r.tickets === 1 ? "" : "s"}, and received a ration crate and ${r.counted.length} water.`, userId: r.userId, shelterId: r.shelterId, dropId: drop.id, actor: "system" });
      const qualified = await tx.supplyDropEligibility.groupBy({ by: ["dropId"], where: { userId: r.userId, eligible: true } });
      if (qualified.length >= 1) await award(tx, r.userId, "first_drop");
      if (qualified.length >= 5) await award(tx, r.userId, "veteran");
    }
    // Survivors that changed hands leave their shelters now, so the next snapshot starts clean.
    for (const l of lost) {
      const h = holdings.get(l.tokenId);
      await tx.survivor.updateMany({ where: { tokenId: l.tokenId }, data: h ? { holder: h.holder, custody: h.custody, level: h.level, checkedAt: new Date() } : { status: "GONE", holder: null, checkedAt: new Date() } });
      if (await tx.shelterMember.findUnique({ where: { tokenId: l.tokenId } })) await evict(tx, l.tokenId, l.reason);
    }
    await record(tx, {
      kind: "drop.snapshot", message: `${drop.name} snapshot taken at Sepolia block ${block}: ${entries.length} shelter${entries.length === 1 ? "" : "s"} qualified with ${cursor} tickets. The draw uses block ${block + RULES.entropyDelayBlocks}.`,
      dropId: drop.id, actor: "system", data: { snapshotHash: hash },
    });
    return true;
  });
}

// ── Draw ────────────────────────────────────────────────────────────────────
export async function runDraw(drop: SupplyDrop) {
  if (!drop.entropyBlock || !drop.snapshotHash) return false;
  const latest = await chain().latestBlock();
  if (latest < drop.entropyBlock + RULES.entropyConfirmations) return false;
  const blockHash = await chain().blockHash(drop.entropyBlock);
  if (!blockHash) return false;
  const seed = openSeed(drop.seedSealed);
  if (seedHashOf(seed) !== drop.seedHash) throw new Error(`Seed for drop ${drop.id} doesn't match its commitment`);

  const elig = await db.supplyDropEligibility.findMany({ where: { dropId: drop.id, eligible: true } });
  const entries: SnapshotEntry[] = elig.map((e) => ({ shelterId: e.shelterId, wallet: e.wallet, tickets: e.tickets }));
  if (snapshotHash(drop.id, entries) !== drop.snapshotHash) throw new Error(`Snapshot rows for drop ${drop.id} no longer match the published hash`);

  const rewards = await db.reward.findMany({ where: { dropId: drop.id, status: "ALLOCATED" }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  const units = rewards.flatMap((r) => Array.from({ length: r.quantity }, () => r));
  const randomness = randomnessOf(seed, blockHash, drop.snapshotHash as Hex);
  const winners = draw(randomness, entries, units.length, drop.maxWinsPerPlayer);
  const byShelter = new Map(elig.map((e) => [e.shelterId, e]));
  const now = new Date();
  const claimBy = new Date(now.getTime() + RULES.claimDays * 86400_000);

  return db.$transaction(async (tx) => {
    const moved = await tx.supplyDrop.updateMany({
      where: { id: drop.id, status: "SNAPSHOT" },
      data: { status: "DRAWN", seed, entropyBlockHash: blockHash, randomness, drawnAt: now, rewardSlots: units.length },
    });
    if (moved.count === 0) return false;
    for (const w of winners) {
      const reward = units[w.slot];
      const e = byShelter.get(w.shelterId)!;
      await tx.rewardDistribution.create({
        data: { dropId: drop.id, rewardId: reward.id, slot: w.slot, ticket: w.ticket, shelterId: w.shelterId, userId: e.userId, wallet: e.wallet, claimBy },
      });
      await record(tx, { kind: "drop.won", message: `${e.shelterName} won ${reward.title}${reward.isDemo ? " (demo reward)" : ""} in ${drop.name} with ticket #${w.ticket}.`, userId: e.userId, shelterId: w.shelterId, dropId: drop.id, actor: "system" });
      await award(tx, e.userId, "crate_cracker");
    }
    // Units nobody could win (too few qualifying shelters) go back to the vault as a new batch.
    for (const r of rewards) {
      const won = winners.filter((w) => units[w.slot].id === r.id).length;
      await tx.reward.update({ where: { id: r.id }, data: { status: "DISTRIBUTED", quantity: won } });
      if (won < r.quantity) {
        await tx.reward.create({ data: { campaignId: r.campaignId, kind: r.kind, title: r.title, description: r.description, quantity: r.quantity - won, isDemo: r.isDemo, status: "AVAILABLE" } });
      }
    }
    await record(tx, {
      kind: "drop.drawn", message: `${drop.name} drawn: ${winners.length} reward${winners.length === 1 ? "" : "s"} allocated from block ${drop.entropyBlock}'s hash. Seed revealed.`,
      dropId: drop.id, actor: "system", data: { randomness },
    });
    return true;
  });
}

// ── The scheduler tick ──────────────────────────────────────────────────────
let lastTick = 0;
let running: Promise<unknown> | null = null;

/** Advances every drop that's due. Idempotent; safe from cron, from page loads, and concurrently. */
export async function tick(now = new Date()) {
  const log: string[] = [];
  const due = await db.supplyDrop.findMany({ where: { status: "SCHEDULED", startsAt: { lte: now } }, orderBy: { startsAt: "asc" } });
  for (const d of due) {
    try {
      const r = await db.supplyDrop.updateMany({ where: { id: d.id, status: "SCHEDULED" }, data: { status: "OPEN" } });
      if (r.count) {
        await record(db, { kind: "drop.opened", message: `${d.name} is open. Snapshot at ${d.endsAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`, dropId: d.id, actor: "system" });
        log.push(`opened ${d.id}`);
      }
    } catch {
      // Another drop is still open: this one waits its turn.
    }
  }
  for (const d of await db.supplyDrop.findMany({ where: { status: "OPEN", endsAt: { lte: now } } })) {
    try {
      if (await takeSnapshot(d)) log.push(`snapshot ${d.id}`);
    } catch (error) {
      await logError("drops.snapshot", error);
      log.push(`snapshot failed ${d.id}`);
    }
  }
  for (const d of await db.supplyDrop.findMany({ where: { status: "SNAPSHOT" } })) {
    try {
      if (await runDraw(d)) log.push(`drawn ${d.id}`);
    } catch (error) {
      await logError("drops.draw", error);
      log.push(`draw failed ${d.id}`);
    }
  }
  const expired = await db.rewardDistribution.updateMany({ where: { status: "ALLOCATED", claimBy: { lt: now } }, data: { status: "EXPIRED" } });
  if (expired.count) log.push(`expired ${expired.count}`);
  const created = await ensureSchedule(now);
  if (created) log.push(`scheduled ${created.id}`);
  const { refreshLeaderboards } = await import("./leaderboards");
  await refreshLeaderboards(now).catch((e) => logError("leaderboards", e));
  return log;
}

/** For page loads: at most one tick every 30 s per server, never blocking more than a moment. */
export async function tickSoon() {
  if (process.env.DISABLE_AUTO_TICK === "1") return;
  if (running || Date.now() - lastTick < 30_000) return;
  lastTick = Date.now();
  running = tick().catch((e) => logError("drops.tick", e)).finally(() => (running = null));
  await Promise.race([running, new Promise((r) => setTimeout(r, 1500))]);
}

// ── Views ───────────────────────────────────────────────────────────────────
export function dropSummary(d: SupplyDrop) {
  return {
    id: d.id, number: d.number, name: d.name, kind: d.kind, status: d.status,
    startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString(),
    rules: { minSurvivors: d.minSurvivors, minResidencyHours: d.minResidencyHours, ticketRule: d.ticketRule, maxWinsPerPlayer: d.maxWinsPerPlayer },
    rulesText: describeRules(d),
    seedHash: d.seedHash,
    totalTickets: d.totalTickets,
    drawnAt: d.drawnAt?.toISOString() ?? null,
    cancelReason: d.cancelReason,
  };
}
