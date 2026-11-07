import { ok, requireUser, route } from "@/server/http";
import { myRewards } from "@/server/vault";

export const GET = route("rewards", async () => ok({ rewards: await myRewards(await requireUser()) }));
