import type { NextRequest } from "next/server";
import { ok, route } from "@/server/http";
import { runBoard } from "@/server/run";

export const GET = route("run.leaderboard", async (req: NextRequest) => {
  const board = req.nextUrl.searchParams.get("board") === "today" ? "today" : "all";
  return ok(await runBoard(board));
});
