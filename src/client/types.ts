/** Response shapes, taken from the server functions that produce them. Type-only: nothing server-side is bundled. */
import type { districtOverview, me, mySurvivors, publicProfile, survivorDetail } from "@/server/player";
import type { myShelters, shelterDetail } from "@/server/shelters";
import type { dropDetail, dropsIndex, myRewards, vaultView } from "@/server/vault";
import type { leaderboards } from "@/server/leaderboards";
import type { adminData } from "@/server/admin";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export type Me = R<typeof me>;
export type SignedIn = Extract<Me, { signedIn: true }>;
export type District = R<typeof districtOverview>;
export type MySurvivors = R<typeof mySurvivors>;
export type SurvivorItem = MySurvivors["survivors"][number];
export type SurvivorDetail = R<typeof survivorDetail>;
export type ShelterView = R<typeof myShelters>[number];
export type ShelterDetail = R<typeof shelterDetail>;
export type DropsIndex = R<typeof dropsIndex>;
export type DropDetail = R<typeof dropDetail>;
export type Vault = R<typeof vaultView>;
export type MyReward = R<typeof myRewards>[number];
export type Leaderboards = R<typeof leaderboards>;
export type PublicProfile = R<typeof publicProfile>;
export type AdminData = { admin: false } | ({ admin: true } & R<typeof adminData>);
export type Activity = District["activity"][number];
