import { verifySchema, verifyWallet } from "@/server/auth";
import { body, ok, route } from "@/server/http";
import { me } from "@/server/player";
import { setSession } from "@/server/session";

export const POST = route("auth.verify", async (req) => {
  const input = await body(req, verifySchema);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const userId = await verifyWallet(input, host);
  await setSession(userId);
  return ok(await me(userId));
});
