import { ok, route } from "@/server/http";
import { sessionUserId } from "@/server/session";
import { dropsIndex } from "@/server/vault";

export const GET = route("drops", async () => ok(await dropsIndex(await sessionUserId())));
