/** Rankings rebuilt from recorded data only: shelters, eligibility rows, distributions and activity. */
import { db } from "./db";
import { shortAddress } from "./players";

export const BOARDS = {
  developed: { title: "Most developed shelters", unit: "dev points" },
  largest: { title: "Largest shelters", unit: "Survivors" },
  drops: { title: "Most supply drops qualified", unit: "drops" },
  rewards: { title: "Most rewards received", unit: "rewards" },
  active: { title: "Most active, last 30 days", unit: "actions" },
} as const;
export type Board = keyof typeof BOARDS;

const REFRESH_MS = 60_000;
let refreshedAt = 0;

type Row = { userId?: string | null; shelterId?: string | null; label: string; wallet?: string | null; value: number };

async function compute(): Promise<Record<Board, Row[]>> {
  const users = await db.user.findMany({ include: { wallet: true, profile: true } });
  const name = new Map(users.map((u) => [u.id, { label: u.profile?.callsign || (u.wallet ? shortAddress(u.wallet.address) : "Unknown"), wallet: u.wallet?.address ?? null }]));
  const shelters = await db.shelter.findMany({ where: { status: "ACTIVE" }, include: { _count: { select: { members: true } } } });
  const sheltersRow = (s: (typeof shelters)[number], value: number): Row => ({ userId: s.ownerId, shelterId: s.id, label: s.name, wallet: name.get(s.ownerId)?.wallet, value });

  const developed = shelters.filter((s) => s.xp > 0).sort((a, b) => b.xp - a.xp || a.createdAt.getTime() - b.createdAt.getTime()).slice(0, 25).map((s) => sheltersRow(s, s.xp));
  const largest = shelters.sort((a, b) => b._count.members - a._count.members || a.createdAt.getTime() - b.createdAt.getTime()).slice(0, 25).map((s) => sheltersRow(s, s._count.members));

  const perUser = (rows: { userId: string; _count: { _all: number } }[]) =>
    rows.sort((a, b) => b._count._all - a._count._all).slice(0, 25).map((r) => ({ userId: r.userId, label: name.get(r.userId)?.label ?? "Unknown", wallet: name.get(r.userId)?.wallet, value: r._count._all }));

  const eligible = await db.supplyDropEligibility.groupBy({ by: ["userId", "dropId"], where: { eligible: true } });
  const dropsByUser = new Map<string, number>();
  for (const e of eligible) dropsByUser.set(e.userId, (dropsByUser.get(e.userId) ?? 0) + 1);
  const drops = perUser([...dropsByUser].map(([userId, n]) => ({ userId, _count: { _all: n } })));

  const wins = await db.rewardDistribution.findMany({ where: { status: { not: "VOID" } }, select: { userId: true } });
  const winsByUser = new Map<string, number>();
  for (const w of wins) winsByUser.set(w.userId, (winsByUser.get(w.userId) ?? 0) + 1);
  const rewards = perUser([...winsByUser].map(([userId, n]) => ({ userId, _count: { _all: n } })));
  const since = new Date(Date.now() - 30 * 86400_000);
  const active = perUser(
    (await db.activityLog.groupBy({ by: ["userId"], where: { actor: "player", createdAt: { gte: since }, userId: { not: null } }, _count: { _all: true } }))
      .map((r) => ({ userId: r.userId as string, _count: r._count })),
  );
  return { developed, largest, drops, rewards, active };
}

export async function refreshLeaderboards(now = new Date(), force = false) {
  if (!force && Date.now() - refreshedAt < REFRESH_MS) return;
  refreshedAt = Date.now();
  const boards = await compute();
  await db.$transaction(async (tx) => {
    await tx.leaderboardEntry.deleteMany({});
    for (const [board, rows] of Object.entries(boards)) {
      if (rows.length === 0) continue;
      await tx.leaderboardEntry.createMany({
        data: rows.map((r, i) => ({ board, rank: i + 1, userId: r.userId ?? null, shelterId: r.shelterId ?? null, label: r.label, wallet: r.wallet ?? null, value: r.value, computedAt: now })),
      });
    }
  });
}

export async function leaderboards(userId: string | null) {
  await refreshLeaderboards();
  const rows = await db.leaderboardEntry.findMany({ orderBy: [{ board: "asc" }, { rank: "asc" }] });
  return {
    computedAt: rows[0]?.computedAt.toISOString() ?? null,
    boards: (Object.keys(BOARDS) as Board[]).map((b) => ({
      key: b, ...BOARDS[b],
      rows: rows.filter((r) => r.board === b).map((r) => ({ rank: r.rank, label: r.label, wallet: r.wallet, value: r.value, shelterId: r.shelterId, mine: Boolean(userId && r.userId === userId) })),
    })),
  };
}

export const clearLeaderboardCache = () => {
  refreshedAt = 0;
};
