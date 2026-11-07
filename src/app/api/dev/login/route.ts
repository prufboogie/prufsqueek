import { z } from "zod";
import { signInAddress } from "@/server/auth";
import { GameError } from "@/server/errors";
import { body, ok, route } from "@/server/http";
import { me } from "@/server/player";
import { normalizeAddress } from "@/server/players";
import { setSession } from "@/server/session";

/** Development only: sign in as an address without a wallet, for browser tests. Off in production, always. */
export const POST = route("dev.login", async (req) => {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") throw new GameError("not_found", 404, "Not found.");
  const { address } = await body(req, z.object({ address: z.string() }));
  const userId = await signInAddress(normalizeAddress(address));
  await setSession(userId);
  return ok(await me(userId));
});
