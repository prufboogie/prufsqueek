import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { establishShelter, myShelters, shelterActionFor } from "@/server/shelters";
import { reconcileMembers, syncPlayer } from "@/server/survivors";
import { player, resetDb, useFakeChain, type FakeChain } from "./helpers";

let chain: FakeChain;
beforeEach(async () => {
  await resetDb();
  chain = useFakeChain();
});

const stack = (userId: string, shelterId: string, tokenId: number, move = false) => shelterActionFor(userId, shelterId, { action: "stack", tokenId, move });

describe("shelters and stacking", () => {
  it("establishes a shelter with an owned Survivor and sizes it by the primary's level", async () => {
    const p = await player();
    chain.give(p.address, [1], { level: 3 });
    const s = await establishShelter(p.userId, { primaryTokenId: 1, name: "Ironside" });
    const [view] = await myShelters(p.userId);
    expect(view.id).toBe(s.id);
    expect(view.capacity).toBe(6);
    expect(view.population).toBe(1);
    expect(await db.playerBadge.count({ where: { userId: p.userId, key: "founder" } })).toBe(1);
  });

  it("refuses Survivors the player doesn't hold, and ones that don't exist", async () => {
    const [a, b] = [await player(), await player()];
    chain.give(b.address, [2]);
    await expect(establishShelter(a.userId, { primaryTokenId: 2, name: "Nope" })).rejects.toMatchObject({ code: "not_your_survivor" });
    await expect(establishShelter(a.userId, { primaryTokenId: 77, name: "Ghost" })).rejects.toMatchObject({ code: "survivor_gone" });
  });

  it("counts staked Squeeks as held by their depositor", async () => {
    const p = await player();
    chain.give(p.address, [5, 6], { custody: "staking" });
    const s = await establishShelter(p.userId, { primaryTokenId: 5, name: "Vault Row" });
    await stack(p.userId, s.id, 6);
    expect((await myShelters(p.userId))[0].population).toBe(2);
  });

  it("stacks up to capacity and refuses one more", async () => {
    const p = await player();
    chain.give(p.address, [1, 2, 3, 4, 5]);
    const s = await establishShelter(p.userId, { primaryTokenId: 1, name: "Small Hole" });
    for (const id of [2, 3, 4]) await stack(p.userId, s.id, id);
    await expect(stack(p.userId, s.id, 5)).rejects.toMatchObject({ code: "shelter_full" });
    expect(await db.playerBadge.count({ where: { userId: p.userId, key: "full_house" } })).toBe(1);
  });

  it("never lets a Survivor sit in two shelters, even under concurrent requests", async () => {
    const p = await player();
    chain.give(p.address, [1, 2, 3]);
    const a = await establishShelter(p.userId, { primaryTokenId: 1, name: "Alpha" });
    const b = await establishShelter(p.userId, { primaryTokenId: 2, name: "Bravo" });
    const results = await Promise.allSettled([stack(p.userId, a.id, 3), stack(p.userId, b.id, 3)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.shelterMember.count({ where: { tokenId: 3 } })).toBe(1);
    await expect(stack(p.userId, a.id, 2)).rejects.toMatchObject({ code: "is_primary" });
  });

  it("holds the capacity under concurrent stacking", async () => {
    const p = await player();
    chain.give(p.address, [1, 2, 3, 4, 5, 6, 7]);
    const s = await establishShelter(p.userId, { primaryTokenId: 1, name: "Crowded" });
    await Promise.allSettled([2, 3, 4, 5, 6, 7].map((id) => stack(p.userId, s.id, id)));
    expect(await db.shelterMember.count({ where: { shelterId: s.id } })).toBe(4);
  });

  it("moves between own shelters only after the cooldown, and never the primary", async () => {
    const p = await player();
    chain.give(p.address, [1, 2, 3]);
    const a = await establishShelter(p.userId, { primaryTokenId: 1, name: "Alpha" });
    const b = await establishShelter(p.userId, { primaryTokenId: 2, name: "Bravo" });
    await stack(p.userId, a.id, 3);
    await expect(stack(p.userId, b.id, 3)).rejects.toMatchObject({ code: "already_sheltered" });
    await expect(stack(p.userId, b.id, 3, true)).rejects.toMatchObject({ code: "move_cooldown" });
    await db.shelterMember.update({ where: { tokenId: 3 }, data: { joinedAt: new Date(Date.now() - 2 * 3600_000) } });
    await stack(p.userId, b.id, 3, true);
    const m = await db.shelterMember.findUniqueOrThrow({ where: { tokenId: 3 } });
    expect(m.shelterId).toBe(b.id);
    expect(await db.shelterStay.count({ where: { tokenId: 3, reason: "moved to Bravo" } })).toBe(1);
  });

  it("refuses changes from anyone but the owner", async () => {
    const [a, b] = [await player(), await player()];
    chain.give(a.address, [1]);
    chain.give(b.address, [2]);
    const s = await establishShelter(a.userId, { primaryTokenId: 1, name: "Mine" });
    await expect(stack(b.userId, s.id, 2)).rejects.toMatchObject({ code: "not_your_shelter" });
    await expect(shelterActionFor(b.userId, s.id, { action: "rename", name: "Theirs" })).rejects.toMatchObject({ code: "not_your_shelter" });
    await expect(shelterActionFor(b.userId, s.id, { action: "abandon", confirm: true })).rejects.toMatchObject({ code: "not_your_shelter" });
  });

  it("removes a transferred resident, and abandons a shelter whose primary was transferred", async () => {
    const [a, b] = [await player(), await player()];
    chain.give(a.address, [1, 2, 3]);
    const s = await establishShelter(a.userId, { primaryTokenId: 1, name: "Leaky" });
    await stack(a.userId, s.id, 2);
    await stack(a.userId, s.id, 3);
    chain.give(b.address, [3]);
    expect((await reconcileMembers({ userId: a.userId })).removed).toBe(1);
    expect(await db.shelterMember.count({ where: { shelterId: s.id } })).toBe(2);
    chain.give(b.address, [1]);
    await syncPlayer(a.userId);
    const after = await db.shelter.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.status).toBe("ABANDONED");
    expect(await db.shelterMember.count({ where: { shelterId: s.id } })).toBe(0);
    // The new owner can now lead with it.
    await establishShelter(b.userId, { primaryTokenId: 1, name: "New Home" });
  });

  it("lets a new owner use a Survivor still recorded in the old owner's shelter", async () => {
    const [a, b] = [await player(), await player()];
    chain.give(a.address, [1, 2]);
    const s = await establishShelter(a.userId, { primaryTokenId: 1, name: "Old" });
    await stack(a.userId, s.id, 2);
    chain.give(b.address, [2, 9]);
    const t = await establishShelter(b.userId, { primaryTokenId: 9, name: "Fresh" });
    await stack(b.userId, t.id, 2);
    expect((await db.shelterMember.findUniqueOrThrow({ where: { tokenId: 2 } })).shelterId).toBe(t.id);
  });

  it("stops stacking into a shelter whose primary was sold", async () => {
    const [a, b] = [await player(), await player()];
    chain.give(a.address, [1, 2]);
    const s = await establishShelter(a.userId, { primaryTokenId: 1, name: "Sold" });
    chain.give(b.address, [1]);
    await expect(stack(a.userId, s.id, 2)).rejects.toMatchObject({ code: "primary_lost" });
    expect((await db.shelter.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("ABANDONED");
  });

  it("removes Survivors burned in a merge", async () => {
    const p = await player();
    chain.give(p.address, [1, 2]);
    const s = await establishShelter(p.userId, { primaryTokenId: 1, name: "Merged" });
    await stack(p.userId, s.id, 2);
    chain.burn(2);
    await syncPlayer(p.userId);
    expect(await db.shelterMember.count({ where: { shelterId: s.id } })).toBe(1);
    expect((await db.survivor.findUniqueOrThrow({ where: { tokenId: 2 } })).status).toBe("GONE");
  });

  it("caps shelters per player and validates names and themes", async () => {
    const p = await player();
    chain.give(p.address, [1, 2, 3, 4, 5, 6]);
    for (const id of [1, 2, 3, 4, 5]) await establishShelter(p.userId, { primaryTokenId: id, name: `Base ${id}` });
    await expect(establishShelter(p.userId, { primaryTokenId: 6, name: "One Too Many" })).rejects.toMatchObject({ code: "too_many_shelters" });
    const [s] = await myShelters(p.userId);
    await expect(shelterActionFor(p.userId, s.id, { action: "theme", theme: "beacon" })).rejects.toMatchObject({ code: "theme_locked" });
    await shelterActionFor(p.userId, s.id, { action: "theme", theme: "bunker" });
  });

  it("keeps working from the chain when the Squeek API is down", async () => {
    const p = await player();
    chain.give(p.address, [1, 2]);
    await syncPlayer(p.userId);
    chain.apiDown = true;
    const r = await syncPlayer(p.userId);
    expect(r.source).toBe("chain");
    expect(r.tokenIds).toEqual([1, 2]);
  });

  it("accepts the browser's list when the API blocks the server, but only Survivors the wallet holds", async () => {
    const [p, other] = [await player(), await player()];
    chain.give(p.address, [1, 2]);
    chain.give(other.address, [3]);
    chain.apiDown = true;
    const r = await syncPlayer(p.userId, [1, 2, 3, 4]);
    expect(r.source).toBe("browser");
    expect(r.tokenIds).toEqual([1, 2]);
    expect(await db.survivor.findUnique({ where: { tokenId: 3 } })).toBeNull();
  });

  it("changes nothing when Sepolia can't be read", async () => {
    const p = await player();
    chain.give(p.address, [1]);
    chain.rpcDown = true;
    await expect(establishShelter(p.userId, { primaryTokenId: 1, name: "Offline" })).rejects.toMatchObject({ code: "chain_unavailable" });
    expect(await db.shelter.count()).toBe(0);
  });
});
