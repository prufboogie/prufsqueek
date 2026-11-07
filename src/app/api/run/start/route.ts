import { ok, requireUser, route, throttle } from "@/server/http";
import { startRun } from "@/server/run";

export const POST = route("run.start", async (req) => {
  const userId = await requireUser();
  throttle(`run.start:${userId}`, 0.5, 6);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return ok(await startRun(userId, host));
});
