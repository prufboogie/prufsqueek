import { z } from "zod";
import { body, ok, requireUser, route, throttle } from "@/server/http";
import { armRun } from "@/server/run";

const Arm = z.object({ ticket: z.string().min(10).max(300), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(4000) });

export const POST = route("run.arm", async (req) => {
  const userId = await requireUser();
  throttle(`run.arm:${userId}`, 0.5, 6);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return ok(await armRun(userId, await body(req, Arm), host));
});
