import { GameError } from "@/server/errors";
import { ok, route } from "@/server/http";
import { survivorDetail } from "@/server/player";

export const GET = route("survivors.detail", async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 9999) throw new GameError("survivor_not_found", 404, "No such Squeek.");
  return ok(await survivorDetail(id));
});
