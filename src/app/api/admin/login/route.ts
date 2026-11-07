import { z } from "zod";
import { GameError } from "@/server/errors";
import { body, ok, route, throttle } from "@/server/http";
import { record } from "@/server/activity";
import { db } from "@/server/db";
import { checkAdminPassword, setAdmin } from "@/server/session";

export const POST = route("admin.login", async (req) => {
  throttle(`admin-login:${req.headers.get("x-forwarded-for") ?? "local"}`, 0.2, 5);
  const { password } = await body(req, z.object({ password: z.string().min(1).max(200) }));
  if (!checkAdminPassword(password)) throw new GameError("bad_password", 401, "Wrong password.");
  await setAdmin();
  await record(db, { kind: "admin.login", message: "Admin signed in.", actor: "admin" });
  return ok({ ok: true });
});
