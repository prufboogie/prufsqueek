import { adminAllowed, adminData } from "@/server/admin";
import { ok, route } from "@/server/http";

export const GET = route("admin.data", async () => {
  if (!(await adminAllowed())) return ok({ admin: false });
  return ok({ admin: true, ...(await adminData()) });
});
