import { beforeEach, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { runAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { createDrop, ensureSchedule, runDraw, takeSnapshot, tick } from "@/server/drops";
import { establishShelter, shelterActionFor } from "@/server/shelters";
import { claimReward } from "@/server/vault";
import { dropDetail } from "@/server/vault";
import { verifyDraw } from "@/shared/fairness";
import { demoCampaign, player, resetDb, settleAll, useFakeChain, type FakeChain } from "./helpers";

let chain: FakeChain;
beforeEach(async () => {
  await resetDb();
  chain = useFakeChain();
});

const HOUR = 3600_000;
const stack = (userId: string, shelterId: string, tokenId: number) => shelterActionFor(userId, shelterId, { action: "stack", tokenId });

async function openDrop(rules: Partial<{ minSurvivors: number; minResidencyHours: number; ticketRule: "PER_SURVIVOR" | "FLAT"; maxWinsPerPlayer: number }> = {}) {
  const now = Date.now();
  const d = await createDrop({ name: "Test Drop", startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR), minSurvivors: 3, minResidencyHours: 12, ticketRule: "PER_SURVIVOR", maxWinsPerPlayer: 1, ...rules });
  await tick();
  return db.supplyDrop.findUniqueOrThrow({ where: { id: d.id } });
}

async function shelterWith(p: { userId: string; address: string }, ids: number[], name = "Base") {
  chain.give(p.address, ids);
  const s = await establishShelter(p.userId, { primaryTokenId: ids[0], name });
  for (const id of ids.slice(1)) await stack(p.userId, s.id, id);
  return s;
}

/** Ends the drop, snapshots, mines the entropy block and draws. */
async function finish(dropId: string) {
  await db.supplyDrop.update({ where: { id: dropId }, data: { endsAt: new Date(Date.now() - 1000) } });
  await tick();
  chain.block += 10;
  await tick();
  return db.supplyDrop.findUniqueOrThrow({ where: { id: dropId } });
}

describe("supply drops", () => {
  it("keeps one drop on the calendar with a published seed commitment", async () => {
    const d = await ensureSchedule();
    expect(d?.seedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d?.seedSealed).not.toContain(d?.seedHash);
    expect(await ensureSchedule()).toBeNull();
    expect((d!.endsAt.getTime() - d!.startsAt.getTime()) / HOUR).toBe(72);
  });

  it("snapshots eligibility by the published rules", async () => {
    const [a, b, c] = [await player(), await player(), await player()];
    const drop = await openDrop();
    const big = await shelterWith(a, [1, 2, 3, 4], "Big");
    const small = await shelterWith(b, [10, 11], "Small");
    const late = await shelterWith(c, [20, 21, 22], "Late");
    await settleAll();
    // Arrived too recently to count.
    await db.shelterMember.update({ where: { tokenId: 22 }, data: { joinedAt: new Date() } });
    // Sold before the snapshot.
    chain.give(b.address, [4]);
    await db.supplyDrop.update({ where: { id: drop.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await tick();
    const rows = await db.supplyDropEligibility.findMany({ where: { dropId: drop.id } });
    const by = (id: string) => rows.find((r) => r.shelterId === id)!;
    expect(by(big.id)).toMatchObject({ eligible: true, tickets: 3, counted: [1, 2, 3] });
    expect(by(small.id)).toMatchObject({ eligible: false, tickets: 0 });
    expect(by(late.id)).toMatchObject({ eligible: false, counted: [20, 21] });
    expect((by(late.id).excluded as { tokenId: number }[])[0].tokenId).toBe(22);
    // The sold Survivor left its shelter at the snapshot.
    expect(await db.shelterMember.findUnique({ where: { tokenId: 4 } })).toBeNull();
    const d = await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } });
    expect(d.status).toBe("SNAPSHOT");
    expect(d.totalTickets).toBe(3);
    expect(d.entropyBlock).toBe(chain.block + 3);
    // Development and supplies for qualifying shelters only.
    expect((await db.shelter.findUniqueOrThrow({ where: { id: big.id } })).xp).toBe(13);
    expect(await db.shelterResource.findMany({ where: { shelterId: small.id } })).toHaveLength(0);
  });

  it("can't snapshot or draw twice, even concurrently", async () => {
    const a = await player();
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await settleAll();
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 2 }]);
    await runAdmin({ action: "reward.allocate", id: rewards[0].id, dropId: drop.id });
    await db.supplyDrop.update({ where: { id: drop.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const fresh = await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } });
    const snaps = await Promise.all([takeSnapshot(fresh), takeSnapshot(fresh), takeSnapshot(fresh)]);
    expect(snaps.filter(Boolean)).toHaveLength(1);
    expect(await db.supplyDropEligibility.count({ where: { dropId: drop.id } })).toBe(1);
    chain.block += 10;
    const snapped = await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } });
    const draws = await Promise.all([runDraw(snapped), runDraw(snapped)]);
    expect(draws.filter(Boolean)).toHaveLength(1);
    expect(await db.rewardDistribution.count({ where: { dropId: drop.id } })).toBe(1);
    expect(await runDraw(await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } }))).toBe(false);
  });

  it("waits for the entropy block and its confirmations before drawing", async () => {
    const a = await player();
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await settleAll();
    await db.supplyDrop.update({ where: { id: drop.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await tick();
    chain.block += 4; // entropy block mined, one confirmation short
    await tick();
    expect((await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("SNAPSHOT");
    chain.block += 1;
    await tick();
    expect((await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("DRAWN");
  });

  it("publishes everything needed to re-run the draw, and the re-run matches", async () => {
    const players = [await player(), await player(), await player(), await player()];
    const drop = await openDrop();
    for (const [i, p] of players.entries()) await shelterWith(p, [i * 10 + 1, i * 10 + 2, i * 10 + 3, ...(i % 2 ? [i * 10 + 4] : [])], `Shelter ${i}`);
    await settleAll();
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 2 }, { title: "Voucher", quantity: 1 }]);
    for (const r of rewards) await runAdmin({ action: "reward.allocate", id: r.id, dropId: drop.id });
    const done = await finish(drop.id);
    expect(done.status).toBe("DRAWN");
    const detail = await dropDetail(drop.id, null);
    const f = detail.fairness;
    const check = verifyDraw({
      dropId: drop.id, seed: f.seed as Hex, seedHash: f.seedHash as Hex, blockHash: f.entropyBlockHash as Hex, snapshotHash: f.snapshotHash as Hex,
      entries: detail.eligibility.filter((e) => e.eligible).map((e) => ({ shelterId: e.shelterId, wallet: e.wallet, tickets: e.tickets })),
      slots: f.slots!, maxWinsPerPlayer: detail.rules.maxWinsPerPlayer, winners: detail.winners.map((w) => ({ slot: w.slot, shelterId: w.shelterId })),
    });
    expect(check.ok).toBe(true);
    expect(detail.winners).toHaveLength(3);
    expect(new Set(detail.winners.map((w) => w.shelterId)).size).toBe(3);
  });

  it("returns units nobody could win to the vault", async () => {
    const a = await player();
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await settleAll();
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 4 }]);
    await runAdmin({ action: "reward.allocate", id: rewards[0].id, dropId: drop.id });
    await finish(drop.id);
    expect(await db.rewardDistribution.count()).toBe(1);
    const back = await db.reward.findFirst({ where: { status: "AVAILABLE", title: "Patch" } });
    expect(back?.quantity).toBe(3);
    expect((await db.reward.findUniqueOrThrow({ where: { id: rewards[0].id } })).quantity).toBe(1);
  });

  it("freezes eligibility at the snapshot: later stacking changes nothing", async () => {
    const a = await player();
    const drop = await openDrop({ minResidencyHours: 0 });
    const s = await shelterWith(a, [1, 2]);
    await db.supplyDrop.update({ where: { id: drop.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await tick();
    chain.give(a.address, [3]);
    await stack(a.userId, s.id, 3);
    chain.block += 10;
    await tick();
    const row = await db.supplyDropEligibility.findFirstOrThrow({ where: { dropId: drop.id } });
    expect(row.eligible).toBe(false);
    expect(await db.rewardDistribution.count()).toBe(0);
  });

  it("lets a winner claim once, and nobody else", async () => {
    const [a, b] = [await player(), await player()];
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await settleAll();
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 1 }]);
    await runAdmin({ action: "reward.allocate", id: rewards[0].id, dropId: drop.id });
    await finish(drop.id);
    const dist = await db.rewardDistribution.findFirstOrThrow();
    await expect(claimReward(b.userId, dist.id)).rejects.toMatchObject({ code: "not_your_reward" });
    const results = await Promise.allSettled([claimReward(a.userId, dist.id), claimReward(a.userId, dist.id), claimReward(a.userId, dist.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.rewardClaim.count()).toBe(1);
    await expect(claimReward(a.userId, dist.id)).rejects.toMatchObject({ code: "already_claimed" });
    await runAdmin({ action: "distribution.fulfil", id: dist.id, note: "sent" });
    await expect(runAdmin({ action: "distribution.fulfil", id: dist.id })).rejects.toMatchObject({ code: "not_claimed" });
  });

  it("expires unclaimed rewards after the window", async () => {
    const a = await player();
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await settleAll();
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 1 }]);
    await runAdmin({ action: "reward.allocate", id: rewards[0].id, dropId: drop.id });
    await finish(drop.id);
    const dist = await db.rewardDistribution.findFirstOrThrow();
    await db.rewardDistribution.update({ where: { id: dist.id }, data: { claimBy: new Date(Date.now() - 1000) } });
    await expect(claimReward(a.userId, dist.id)).rejects.toMatchObject({ code: "claim_expired" });
    await tick();
    expect((await db.rewardDistribution.findUniqueOrThrow({ where: { id: dist.id } })).status).toBe("EXPIRED");
  });

  it("locks a drop's rules once it opens, and cancelling returns its rewards", async () => {
    const drop = await openDrop();
    await expect(runAdmin({ action: "drop.update", id: drop.id, minSurvivors: 1 })).rejects.toMatchObject({ code: "drop_locked" });
    const { rewards } = await demoCampaign([{ title: "Patch", quantity: 1 }]);
    await runAdmin({ action: "reward.allocate", id: rewards[0].id, dropId: drop.id });
    await runAdmin({ action: "drop.cancel", id: drop.id, reason: "test" });
    expect((await db.reward.findUniqueOrThrow({ where: { id: rewards[0].id } })).status).toBe("AVAILABLE");
    await expect(runAdmin({ action: "drop.cancel", id: drop.id, reason: "again" })).rejects.toMatchObject({ code: "drop_locked" });
  });

  it("leaves the drop open and retries when Sepolia can't be read at the snapshot", async () => {
    const a = await player();
    const drop = await openDrop();
    await shelterWith(a, [1, 2, 3]);
    await db.supplyDrop.update({ where: { id: drop.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    chain.rpcDown = true;
    await tick();
    expect((await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("OPEN");
    chain.rpcDown = false;
    await tick();
    expect((await db.supplyDrop.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("SNAPSHOT");
  });

  it("refuses a partner campaign until the partnership is verified", async () => {
    const p = await runAdmin({ action: "partner.create", name: "Some Project", isDemo: false });
    await expect(runAdmin({ action: "campaign.create", title: "Real", description: "x", partnerId: (p as { id: string }).id, isDemo: false, status: "ACTIVE" })).rejects.toMatchObject({ code: "partner_unverified" });
    await runAdmin({ action: "partner.update", id: (p as { id: string }).id, verified: true, status: "ACTIVE" });
    await runAdmin({ action: "campaign.create", title: "Real", description: "x", partnerId: (p as { id: string }).id, isDemo: false, status: "ACTIVE" });
  });
});
