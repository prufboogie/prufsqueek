import { ok, route } from "@/server/http";
import { sessionUserId } from "@/server/session";
import { dropDetail } from "@/server/vault";

export const GET = route("drops.detail", async (_req, ctx) => ok(await dropDetail((await ctx.params).id, await sessionUserId())));
