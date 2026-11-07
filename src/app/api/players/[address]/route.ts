import { ok, route } from "@/server/http";
import { publicProfile } from "@/server/player";

export const GET = route("players", async (_req, ctx) => ok(await publicProfile((await ctx.params).address)));
