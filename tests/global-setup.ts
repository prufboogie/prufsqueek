import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://adebayodaniel@localhost:5432/last_district_test";
  if (!/_test\b/.test(url)) throw new Error("Tests only run against a database named *_test");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
