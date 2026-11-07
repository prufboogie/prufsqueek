import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { GameError, logError } from "./errors";
import { sessionUserId } from "./session";

/** JSON that can carry BigInt from the database. */
const encode = (data: unknown) => JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(encode(data), { headers: { "Cache-Control": "no-store" }, ...init });

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/** Same-site writes only. A cross-site form can't reach a play or a credit grant. */
function checkOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw new GameError("bad_origin", 403, "That request came from another site.");
}

export function route(scope: string, handler: Handler) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      checkOrigin(req);
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof GameError) {
        return NextResponse.json({ error: error.code, message: error.message, ...error.extra }, { status: error.status });
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "invalid_request", message: error.issues[0]?.message ?? "That request isn't valid." }, { status: 400 });
      }
      await logError(scope, error);
      return NextResponse.json({ error: "server_error", message: "Something broke on our side. Nothing was changed." }, { status: 500 });
    }
  };
}

export async function requireUser(): Promise<string> {
  const id = await sessionUserId();
  if (!id) throw new GameError("no_session", 401, "Connect your wallet to enter the district.");
  return id;
}

export async function body<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new GameError("invalid_json", 400, "That request isn't valid JSON.");
  }
  return schema.parse(raw);
}

const buckets = new Map<string, { tokens: number; at: number }>();
/** Per-instance limiter. A burst guard, not a quota: quotas that matter live in the database. */
export function throttle(key: string, perSecond: number, burst: number) {
  const now = Date.now();
  if (buckets.size > 20_000) buckets.clear();
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSecond);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new GameError("slow_down", 429, "Easy there. Give the radio a second.");
  }
  b.tokens -= 1;
  buckets.set(key, b);
}
