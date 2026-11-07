import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { Prisma } from "@prisma/client";
import { RUN, implausible, runMessage, runScore } from "@/shared/run";
import { signedBy } from "./auth";
import { effectiveWallet } from "./chain";
import { db } from "./db";
import { GameError } from "./errors";
import { displayName } from "./players";
import { readToken, signToken } from "./session";

/**
 * A run takes three steps, none stored until the score is saved:
 *  1. start: the server picks a seed and hands back a short-lived ticket and the message to sign;
 *  2. arm: the player's wallet signs that message, the server checks it and issues the run's clock;
 *  3. finish: the server checks the clock, the player and the numbers, then saves the score once.
 */
async function walletFor(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { wallet: true, profile: true } });
  if (!user?.wallet) throw new GameError("wallet_required", 403, "Connect a wallet to run.");
  return { user, address: getAddress(user.wallet.address) };
}

export async function startRun(userId: string, host: string, now = Date.now()) {
  const { address } = await walletFor(userId);
  const seed = randomBytes(4).readUInt32BE(0);
  const run = `${seed}-${now}-${userId}`;
  return { seed, ticket: signToken("run.start", run, now + RUN.signWindowMs), message: runMessage(host, address, run) };
}

export async function armRun(userId: string, input: { ticket: string; signature: string }, host: string, now = Date.now()) {
  const run = readToken("run.start", input.ticket, now);
  if (!run) throw new GameError("run_expired", 400, "That run request expired. Tap Run to start again.");
  const [seed, , owner] = run.split("-");
  if (owner !== userId) throw new GameError("not_your_run", 403, "That run was started by another player.");
  const { address } = await walletFor(userId);
  if (!(await signedBy(address, runMessage(host, address, run), input.signature))) throw new GameError("bad_signature", 401, "That signature isn't from the wallet you signed in with.");
  // The clock starts once the signature is in, so time spent in the wallet doesn't count.
  return { seed: Number(seed), ticket: signToken("run.armed", `${seed}-${now}-${userId}`, now + RUN.maxRunMs) };
}

export type FinishInput = { ticket: string; distance: number; coins: number; tokenId?: number | null };

export async function finishRun(userId: string, input: FinishInput, now = Date.now()) {
  const subject = readToken("run.armed", input.ticket, now);
  if (!subject) throw new GameError("run_expired", 400, "That run's ticket expired. Start a new run to post a score.");
  const [, startedAt, owner] = subject.split("-");
  if (owner !== userId) throw new GameError("not_your_run", 403, "That run was started by another player.");
  const distance = Math.floor(input.distance);
  const coins = Math.floor(input.coins);
  const elapsedMs = now - Number(startedAt);
  const why = implausible({ distance, coins, elapsedMs });
  if (why) throw new GameError("run_rejected", 422, "That run doesn't add up, so it wasn't posted.", { reason: why });

  const { user, address } = await walletFor(userId);
  const name = displayName(user);
  let tokenId: number | null = null;
  // Only show a Squeek on the board if the game last saw it with this player.
  if (input.tokenId) {
    const s = await db.survivor.findUnique({ where: { tokenId: input.tokenId } });
    if (s?.holder && s.status === "ACTIVE" && s.holder.toLowerCase() === effectiveWallet(address).toLowerCase()) tokenId = s.tokenId;
  }

  const score = runScore(distance, coins);
  try {
    await db.runScore.create({ data: { seed: subject, userId, name, guest: false, tokenId, score, distance, coins, durationMs: Math.max(0, Math.min(elapsedMs, RUN.maxRunMs)) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new GameError("run_already_saved", 409, "That run is already on the board.");
    throw e;
  }
  const rank = (await db.runScore.count({ where: { score: { gt: score } } })) + 1;
  const best = await db.runScore.aggregate({ where: { userId }, _max: { score: true } });
  return { score, distance, coins, rank, best: best._max.score ?? score, name };
}

export type RunRow = { rank: number; name: string; tokenId: number | null; score: number; distance: number; coins: number; at: string };

/** Best run per player, highest first. */
export async function runBoard(board: "all" | "today", now = new Date()) {
  const since = board === "today" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : undefined;
  const where = { userId: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) };
  const rows = await db.runScore.findMany({ where, orderBy: [{ score: "desc" }, { createdAt: "asc" }], take: 300 });
  const seen = new Set<string>();
  const out: RunRow[] = [];
  for (const r of rows) {
    if (seen.has(r.userId!)) continue;
    seen.add(r.userId!);
    out.push({ rank: out.length + 1, name: r.name, tokenId: r.tokenId, score: r.score, distance: r.distance, coins: r.coins, at: r.createdAt.toISOString() });
    if (out.length >= 25) break;
  }
  return { board, rows: out, runs: await db.runScore.count({ where }) };
}
