import { timingSafeEqual } from "node:crypto";
import { tick } from "@/server/drops";
import { GameError } from "@/server/errors";
import { ok, route } from "@/server/http";

/** For an external scheduler: Authorization: Bearer $CRON_SECRET. */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError("unauthorized", 401, "Unauthorized.");
  return ok({ log: await tick() });
}
export const GET = route("cron.tick", handler);
export const POST = route("cron.tick", handler);
