/**
 * The supply drop draw. Pure and deterministic: the server runs it to pick winners, and the
 * verifier page runs this same code in the browser to check them.
 *
 *   seedHash   = keccak256(seed)                       published when the drop is created
 *   snapshot   = the qualifying shelters and tickets   published at the snapshot
 *   blockHash  = hash of a Sepolia block chosen at the snapshot, mined after it
 *   randomness = keccak256(seed ‖ blockHash ‖ snapshotHash)
 *   slot i     = keccak256(randomness ‖ i) mod (tickets still in the pool)
 *
 * The seed is fixed before anyone knows the block, and the block is unknown when the snapshot is
 * frozen, so neither side alone can steer the result.
 */
import { concat, keccak256, numberToHex, toBytes, type Hex } from "viem";

export type SnapshotEntry = { shelterId: string; wallet: string; tickets: number };
export type Winner = { slot: number; ticket: number; shelterId: string; wallet: string };

const byId = (a: SnapshotEntry, b: SnapshotEntry) => (a.shelterId < b.shelterId ? -1 : a.shelterId > b.shelterId ? 1 : 0);

/** Entries in the one order everything uses: shelter id, ascending, by code unit. */
export const orderEntries = (entries: SnapshotEntry[]) => [...entries].filter((e) => e.tickets > 0).sort(byId);

export function snapshotHash(dropId: string, entries: SnapshotEntry[]): Hex {
  const body = orderEntries(entries).map((e) => `${e.shelterId}:${e.wallet.toLowerCase()}:${e.tickets}`).join(",");
  return keccak256(toBytes(`last-district/snapshot/v1|${dropId}|${body}`));
}

export const seedHashOf = (seed: Hex): Hex => keccak256(seed);

export const randomnessOf = (seed: Hex, blockHash: Hex, snapshot: Hex): Hex => keccak256(concat([seed, blockHash, snapshot]));

/** Picks winners for `slots` reward units. One win per shelter; at most `maxWinsPerPlayer` per wallet. */
export function draw(randomness: Hex, entries: SnapshotEntry[], slots: number, maxWinsPerPlayer: number): Winner[] {
  const ordered = orderEntries(entries);
  const starts = new Map<string, number>();
  let cursor = 0;
  for (const e of ordered) {
    starts.set(e.shelterId, cursor);
    cursor += e.tickets;
  }
  let pool = ordered;
  const winsByWallet = new Map<string, number>();
  const winners: Winner[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const total = pool.reduce((s, e) => s + e.tickets, 0);
    if (total === 0) break;
    const roll = BigInt(keccak256(concat([randomness, numberToHex(slot, { size: 32 })]))) % BigInt(total);
    let acc = 0n;
    let picked = pool[pool.length - 1];
    let offset = 0;
    for (const e of pool) {
      if (roll < acc + BigInt(e.tickets)) {
        picked = e;
        offset = Number(roll - acc);
        break;
      }
      acc += BigInt(e.tickets);
    }
    const wallet = picked.wallet.toLowerCase();
    winners.push({ slot, ticket: (starts.get(picked.shelterId) ?? 0) + offset, shelterId: picked.shelterId, wallet: picked.wallet });
    const wins = (winsByWallet.get(wallet) ?? 0) + 1;
    winsByWallet.set(wallet, wins);
    pool = pool.filter((e) => e.shelterId !== picked.shelterId && !(wins >= maxWinsPerPlayer && e.wallet.toLowerCase() === wallet));
  }
  return winners;
}

export type VerifyInput = {
  dropId: string;
  seed: Hex;
  seedHash: Hex;
  blockHash: Hex;
  snapshotHash: Hex;
  entries: SnapshotEntry[];
  slots: number;
  maxWinsPerPlayer: number;
  winners: { slot: number; shelterId: string }[];
};

/** Re-runs every step and says which one, if any, doesn't match what was published. */
export function verifyDraw(input: VerifyInput) {
  const checks: { label: string; ok: boolean; detail: string }[] = [];
  const sh = seedHashOf(input.seed);
  checks.push({ label: "Seed matches the commitment published before the drop", ok: sh === input.seedHash, detail: sh });
  const snap = snapshotHash(input.dropId, input.entries);
  checks.push({ label: "Snapshot list matches the published snapshot hash", ok: snap === input.snapshotHash, detail: snap });
  const randomness = randomnessOf(input.seed, input.blockHash, snap);
  const computed = draw(randomness, input.entries, input.slots, input.maxWinsPerPlayer);
  const same = computed.length === input.winners.length && computed.every((w, i) => w.slot === input.winners[i]?.slot && w.shelterId === input.winners[i]?.shelterId);
  checks.push({ label: "Winners re-drawn from the same inputs match the published winners", ok: same, detail: `${computed.length} winner${computed.length === 1 ? "" : "s"} recomputed` });
  return { ok: checks.every((c) => c.ok), randomness, computed, checks };
}
