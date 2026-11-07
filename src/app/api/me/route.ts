import { body, ok, requireUser, route } from "@/server/http";
import { me, profileSchema, updateProfile } from "@/server/player";
import { sessionUserId } from "@/server/session";

export const GET = route("me", async () => ok(await me(await sessionUserId())));

export const PATCH = route("me.update", async (req) => {
  const userId = await requireUser();
  await updateProfile(userId, await body(req, profileSchema));
  return ok(await me(userId));
});
