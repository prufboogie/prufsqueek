import { body, ok, requireUser, route, throttle } from "@/server/http";
import { establishSchema, establishShelter, myShelters } from "@/server/shelters";

export const GET = route("shelters", async () => ok({ shelters: await myShelters(await requireUser()) }));

export const POST = route("shelters.establish", async (req) => {
  const userId = await requireUser();
  throttle(`write:${userId}`, 2, 8);
  const s = await establishShelter(userId, await body(req, establishSchema));
  return ok({ id: s.id }, { status: 201 });
});
