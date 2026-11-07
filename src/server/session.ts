import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

export const SESSION_COOKIE = "ld_session";
export const ADMIN_COOKIE = "ld_admin";
const SESSION_DAYS = 180;
const ADMIN_HOURS = 12;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("SESSION_SECRET must be set to at least 24 characters");
  return value;
}

const sign = (purpose: string, body: string) => createHmac("sha256", secret()).update(`${purpose}.${body}`).digest("base64url");

export function signToken(purpose: string, subject: string, expiresAt: number) {
  const body = `${subject}.${expiresAt}`;
  return `${body}.${sign(purpose, body)}`;
}

export function readToken(purpose: string, token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [subject, expiry, mac] = parts;
  const expected = Buffer.from(sign(purpose, `${subject}.${expiry}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expiry) < now) return null;
  return subject;
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return readToken("session", jar.get(SESSION_COOKIE)?.value);
}

export async function setSession(userId: string) {
  const jar = await cookies();
  const seconds = SESSION_DAYS * 86400;
  jar.set(SESSION_COOKIE, signToken("session", userId, Date.now() + seconds * 1000), cookieOptions(seconds));
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return readToken("admin", jar.get(ADMIN_COOKIE)?.value) === "admin";
}

export async function setAdmin() {
  const jar = await cookies();
  const seconds = ADMIN_HOURS * 3600;
  jar.set(ADMIN_COOKIE, signToken("admin", "admin", Date.now() + seconds * 1000), cookieOptions(seconds));
}

export async function clearAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export function checkAdminPassword(given: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

/** Undefined with no proxy in front, as in local development, where there's no real address to limit. */
export async function clientIpHash(): Promise<string | undefined> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (!ip) return undefined;
  return createHmac("sha256", secret()).update(`ip.${ip}`).digest("hex").slice(0, 32);
}
