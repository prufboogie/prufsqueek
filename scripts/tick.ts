/** Runs the scheduler once. Point a cron at this (or at /api/cron/tick). */
import { db } from "../src/server/db";
import { tick } from "../src/server/drops";

tick().then((log) => console.log(log.length ? log.join("\n") : "nothing due")).finally(() => db.$disconnect());
