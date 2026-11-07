import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export type Activity = {
  kind: string;
  message: string;
  userId?: string | null;
  shelterId?: string | null;
  tokenId?: number | null;
  dropId?: string | null;
  actor?: "player" | "system" | "admin";
  data?: Prisma.InputJsonValue;
};

/** Every state change writes one of these, in the same transaction as the change. */
export async function record(tx: Tx | typeof db, a: Activity) {
  await tx.activityLog.create({
    data: {
      kind: a.kind, message: a.message.slice(0, 300), userId: a.userId ?? null, shelterId: a.shelterId ?? null,
      tokenId: a.tokenId ?? null, dropId: a.dropId ?? null, actor: a.actor ?? "player", data: a.data,
    },
  });
}

export const activityView = (a: { id: string; createdAt: Date; kind: string; message: string; shelterId: string | null; tokenId: number | null; dropId: string | null; actor: string }) => ({
  id: a.id, at: a.createdAt.toISOString(), kind: a.kind, message: a.message, shelterId: a.shelterId, tokenId: a.tokenId, dropId: a.dropId, actor: a.actor,
});
