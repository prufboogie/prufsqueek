import { ok, requireUser, route, throttle } from "@/server/http";
import { mySurvivors } from "@/server/player";

export const GET = route("survivors", async () => {
  const userId = await requireUser();
  throttle(`survivors:${userId}`, 0.5, 6);
  return ok(await mySurvivors(userId));
});
