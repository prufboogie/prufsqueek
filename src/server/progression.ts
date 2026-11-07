import { BADGES } from "@/shared/rules";
import { record } from "./activity";
import type { Tx } from "./db";

/** Awards a badge once. Safe to call repeatedly. */
export async function award(tx: Tx, userId: string, key: keyof typeof BADGES | string) {
  const res = await tx.playerBadge.createMany({ data: [{ userId, key }], skipDuplicates: true });
  if (res.count > 0) await record(tx, { kind: "badge.earned", message: `Earned the ${BADGES[key]?.name ?? key} badge.`, userId, actor: "system", data: { badge: key } });
}

/** Checks the shelter-shaped badges after a change. */
export async function checkShelterBadges(tx: Tx, userId: string) {
  const shelters = await tx.shelter.findMany({ where: { ownerId: userId, status: "ACTIVE" }, select: { id: true } });
  if (shelters.length >= 1) await award(tx, userId, "founder");
  if (shelters.length >= 3) await award(tx, userId, "network");
}
