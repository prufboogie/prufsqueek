import { body, ok, requireUser, route, throttle } from "@/server/http";
import { shelterAction, shelterActionFor, shelterDetail } from "@/server/shelters";

export const GET = route("shelters.detail", async (_req, ctx) => ok(await shelterDetail((await ctx.params).id)));

export const POST = route("shelters.action", async (req, ctx) => {
  const userId = await requireUser();
  throttle(`write:${userId}`, 2, 8);
  const { id } = await ctx.params;
  const result = await shelterActionFor(userId, id, await body(req, shelterAction));
  return ok({ ok: true, result: result ?? null, shelter: await shelterDetail(id) });
});
