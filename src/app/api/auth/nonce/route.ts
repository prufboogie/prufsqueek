import { issueNonce } from "@/server/auth";
import { ok, route, throttle } from "@/server/http";

export const POST = route("auth.nonce", async (req) => {
  throttle(`nonce:${req.headers.get("x-forwarded-for") ?? "local"}`, 1, 10);
  return ok({ nonce: await issueNonce() });
});
