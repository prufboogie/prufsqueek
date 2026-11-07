import { ok, route } from "@/server/http";
import { clearSession } from "@/server/session";

export const POST = route("auth.logout", async () => {
  await clearSession();
  return ok({ signedIn: false });
});
