import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signInAddress } from "@/server/auth";
import { db } from "@/server/db";
import { armRun, finishRun, runBoard, startRun } from "@/server/run";
import { syncPlayer } from "@/server/survivors";
import { implausible, runScore, speedAt, RUN } from "@/shared/run";
import { resetDb, useFakeChain, type FakeChain } from "./helpers";

let chain: FakeChain;
beforeEach(async () => {
  await resetDb();
  chain = useFakeChain();
});

const T0 = 1_800_000_000_000;
const HOST = "last-district.test";

/** A player with a real key, so the run message can be signed. */
async function runner() {
  const account = privateKeyToAccount(generatePrivateKey());
  const userId = await signInAddress(account.address);
  return { account, userId, address: account.address };
}

/** start → sign → arm, as the browser does it. */
async function armed(p: Awaited<ReturnType<typeof runner>>, at = T0) {
  const s = await startRun(p.userId, HOST, at);
  const signature = await p.account.signMessage({ message: s.message });
  return armRun(p.userId, { ticket: s.ticket, signature }, HOST, at + 2000);
}

describe("Ash Run", () => {
  it("ramps speed from base to top and never past it", () => {
    expect(speedAt(0)).toBe(RUN.baseSpeed);
    expect(speedAt(1e7)).toBeCloseTo(RUN.topSpeed, 5);
  });

  it("rejects runs faster than the track allows, or with too many coins", () => {
    expect(implausible({ distance: 1000, coins: 100, elapsedMs: 60_000 })).toBeNull();
    expect(implausible({ distance: 5000, coins: 0, elapsedMs: 60_000 })).toBe("too_fast");
    expect(implausible({ distance: 1000, coins: 5000, elapsedMs: 60_000 })).toBe("too_many_coins");
  });

  it("asks the wallet to sign a gas-free message naming the wallet, the site and the run", async () => {
    const p = await runner();
    const s = await startRun(p.userId, HOST, T0);
    expect(s.message).toContain(p.address);
    expect(s.message).toContain(HOST);
    expect(s.message).toContain("sends no transaction");
    const a = await armed(p);
    expect(a.seed).toBeTypeOf("number");
  });

  it("refuses a signature from another wallet, or for another site", async () => {
    const [p, other] = [await runner(), await runner()];
    const s = await startRun(p.userId, HOST, T0);
    const wrongWallet = await other.account.signMessage({ message: s.message });
    await expect(armRun(p.userId, { ticket: s.ticket, signature: wrongWallet }, HOST, T0 + 1000)).rejects.toMatchObject({ code: "bad_signature" });
    const signed = await p.account.signMessage({ message: s.message });
    await expect(armRun(p.userId, { ticket: s.ticket, signature: signed }, "evil.test", T0 + 1000)).rejects.toMatchObject({ code: "bad_signature" });
    await expect(armRun(other.userId, { ticket: s.ticket, signature: signed }, HOST, T0 + 1000)).rejects.toMatchObject({ code: "not_your_run" });
    await expect(armRun(p.userId, { ticket: s.ticket, signature: signed }, HOST, T0 + RUN.signWindowMs + 1)).rejects.toMatchObject({ code: "run_expired" });
  });

  it("only posts runs that were signed, by the player who signed them, once", async () => {
    const [p, other] = [await runner(), await runner()];
    const unsigned = await startRun(p.userId, HOST, T0);
    await expect(finishRun(p.userId, { ticket: unsigned.ticket, distance: 100, coins: 0 }, T0 + 30_000)).rejects.toMatchObject({ code: "run_expired" });
    const { ticket } = await armed(p);
    await expect(finishRun(other.userId, { ticket, distance: 100, coins: 0 }, T0 + 30_000)).rejects.toMatchObject({ code: "not_your_run" });
    const r = await finishRun(p.userId, { ticket, distance: 800.7, coins: 40 }, T0 + 62_000);
    expect(r.score).toBe(runScore(800, 40));
    expect(r.rank).toBe(1);
    await expect(finishRun(p.userId, { ticket, distance: 800, coins: 40 }, T0 + 63_000)).rejects.toMatchObject({ code: "run_already_saved" });
  });

  it("refuses a run that went further than the time since signing allows", async () => {
    const p = await runner();
    const { ticket } = await armed(p);
    await expect(finishRun(p.userId, { ticket, distance: 9000, coins: 0 }, T0 + 12_000)).rejects.toMatchObject({ code: "run_rejected" });
    expect(await db.runScore.count()).toBe(0);
  });

  it("shows a Squeek on the board only if the player holds it", async () => {
    const [a, b] = [await runner(), await runner()];
    chain.give(a.address, [7]);
    chain.give(b.address, [8]);
    await syncPlayer(a.userId);
    await syncPlayer(b.userId);
    await finishRun(a.userId, { ticket: (await armed(a)).ticket, distance: 100, coins: 1, tokenId: 7 }, T0 + 30_000);
    await finishRun(a.userId, { ticket: (await armed(a)).ticket, distance: 90, coins: 1, tokenId: 8 }, T0 + 30_000);
    const rows = await db.runScore.findMany({ orderBy: { score: "desc" } });
    expect(rows.map((r) => r.tokenId)).toEqual([7, null]);
  });

  it("lists each player's best run once", async () => {
    const [a, b] = [await runner(), await runner()];
    for (const [p, d] of [[a, 300], [a, 500], [b, 400]] as const) await finishRun(p.userId, { ticket: (await armed(p)).ticket, distance: d, coins: 0 }, T0 + 60_000);
    const { rows } = await runBoard("all");
    expect(rows.map((r) => r.score)).toEqual([500, 400]);
  });
});
