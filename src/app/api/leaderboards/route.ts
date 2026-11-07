import { ok, route } from "@/server/http";
import { leaderboards } from "@/server/leaderboards";
import { sessionUserId } from "@/server/session";

export const GET = route("leaderboards", async () => ok(await leaderboards(await sessionUserId())));
