import { z } from "zod";
import { body, ok, requireUser, route, throttle } from "@/server/http";
import { mySurvivors } from "@/server/player";

export const GET = route("survivors", async () => {
  const userId = await requireUser();
  throttle(`survivors:${userId}`, 0.5, 6);
  return ok(await mySurvivors(userId));
});

/** Same, with token ids the browser read from the official API. Each is verified on-chain. */
export const POST = route("survivors.hint", async (req) => {
  const userId = await requireUser();
  throttle(`survivors:${userId}`, 0.5, 6);
  const { hint } = await body(req, z.object({ hint: z.array(z.number().int().min(1).max(9999)).max(500) }));
  return ok(await mySurvivors(userId, hint));
});
