import { z } from "zod";
import { body, ok, requireUser, route, throttle } from "@/server/http";
import { claimReward } from "@/server/vault";

export const POST = route("claims", async (req) => {
  const userId = await requireUser();
  throttle(`write:${userId}`, 2, 8);
  const { distributionId } = await body(req, z.object({ distributionId: z.string().min(1).max(40) }));
  const claim = await claimReward(userId, distributionId);
  return ok({ id: claim.id, claimedAt: claim.claimedAt.toISOString() }, { status: 201 });
});
