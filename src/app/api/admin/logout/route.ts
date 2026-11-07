import { ok, route } from "@/server/http";
import { clearAdmin } from "@/server/session";

export const POST = route("admin.logout", async () => {
  await clearAdmin();
  return ok({ ok: true });
});
