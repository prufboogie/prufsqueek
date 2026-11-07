import { ok, route } from "@/server/http";
import { districtOverview } from "@/server/player";
import { sessionUserId } from "@/server/session";

export const GET = route("district", async () => ok(await districtOverview(await sessionUserId())));
