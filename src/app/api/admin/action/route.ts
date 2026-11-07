import { adminAction, requireAdmin, runAdmin } from "@/server/admin";
import { body, ok, route } from "@/server/http";

export const POST = route("admin.action", async (req) => {
  await requireAdmin();
  return ok({ ok: true, result: (await runAdmin(await body(req, adminAction))) ?? null });
});
