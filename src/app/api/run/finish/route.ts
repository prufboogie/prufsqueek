import { z } from "zod";
import { body, ok, requireUser, route, throttle } from "@/server/http";
import { finishRun } from "@/server/run";

const Finish = z.object({
  ticket: z.string().min(10).max(300),
  distance: z.number().min(0).max(1_000_000),
  coins: z.number().int().min(0).max(1_000_000),
  tokenId: z.number().int().min(1).max(9999).nullable().optional(),
});

export const POST = route("run.finish", async (req) => {
  const userId = await requireUser();
  throttle(`run.finish:${userId}`, 0.5, 4);
  return ok(await finishRun(userId, await body(req, Finish)));
});
