import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { draw, randomnessOf, seedHashOf, snapshotHash, verifyDraw, type SnapshotEntry } from "@/shared/fairness";

const entries: SnapshotEntry[] = [
  { shelterId: "c3", wallet: "0x00000000000000000000000000000000000000b2", tickets: 5 },
  { shelterId: "a1", wallet: "0x00000000000000000000000000000000000000a1", tickets: 3 },
  { shelterId: "b2", wallet: "0x00000000000000000000000000000000000000a1", tickets: 4 },
  { shelterId: "d4", wallet: "0x00000000000000000000000000000000000000c3", tickets: 1 },
];
const seed = keccak256(toHex("seed")) as Hex;
const block = keccak256(toHex("block")) as Hex;

describe("fairness", () => {
  it("hashes the snapshot independent of input order, and changes with any ticket", () => {
    expect(snapshotHash("d", entries)).toBe(snapshotHash("d", [...entries].reverse()));
    expect(snapshotHash("d", entries)).not.toBe(snapshotHash("d", entries.map((e, i) => (i === 0 ? { ...e, tickets: 6 } : e))));
    expect(snapshotHash("d", entries)).not.toBe(snapshotHash("other", entries));
  });

  it("is deterministic and never picks a shelter twice", () => {
    const r = randomnessOf(seed, block, snapshotHash("d", entries));
    const a = draw(r, entries, 10, 5);
    expect(draw(r, entries, 10, 5)).toEqual(a);
    expect(a).toHaveLength(4);
    expect(new Set(a.map((w) => w.shelterId)).size).toBe(4);
  });

  it("respects the per-player cap", () => {
    for (let i = 0; i < 50; i++) {
      const r = keccak256(toHex(`r${i}`)) as Hex;
      const wins = draw(r, entries, 10, 1);
      const wallets = wins.map((w) => w.wallet.toLowerCase());
      expect(new Set(wallets).size).toBe(wallets.length);
      expect(wins).toHaveLength(3);
    }
  });

  it("picks in proportion to tickets", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const [w] = draw(keccak256(toHex(`p${i}`)) as Hex, entries, 1, 1);
      counts[w.shelterId] = (counts[w.shelterId] ?? 0) + 1;
    }
    // 13 tickets: c3 5/13 ≈ 0.385, d4 1/13 ≈ 0.077.
    expect(counts.c3 / 4000).toBeGreaterThan(0.34);
    expect(counts.c3 / 4000).toBeLessThan(0.43);
    expect(counts.d4 / 4000).toBeGreaterThan(0.05);
    expect(counts.d4 / 4000).toBeLessThan(0.11);
  });

  it("verifies a genuine draw and catches tampering at each step", () => {
    const snap = snapshotHash("d", entries);
    const winners = draw(randomnessOf(seed, block, snap), entries, 2, 1);
    const input = { dropId: "d", seed, seedHash: seedHashOf(seed), blockHash: block, snapshotHash: snap, entries, slots: 2, maxWinsPerPlayer: 1, winners };
    expect(verifyDraw(input).ok).toBe(true);
    expect(verifyDraw({ ...input, seed: keccak256(toHex("other")) }).checks[0].ok).toBe(false);
    expect(verifyDraw({ ...input, entries: entries.slice(1) }).checks[1].ok).toBe(false);
    expect(verifyDraw({ ...input, winners: [{ slot: 0, shelterId: "zz" }, winners[1]] }).checks[2].ok).toBe(false);
  });
});
