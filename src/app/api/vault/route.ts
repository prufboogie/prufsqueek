import { ok, route } from "@/server/http";
import { vaultView } from "@/server/vault";

export const GET = route("vault", async () => ok(await vaultView()));
