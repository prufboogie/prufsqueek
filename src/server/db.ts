import { PrismaClient, Prisma } from "@prisma/client";

const holder = globalThis as unknown as { __districtDb?: PrismaClient };
export const db = holder.__districtDb ?? new PrismaClient({
  log: ["error"],
  transactionOptions: { timeout: 20_000, maxWait: 10_000 },
  // On Neon, this is the pooled URL with the settings Prisma needs. Locally there's just DATABASE_URL.
  datasourceUrl: process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL,
});
if (process.env.NODE_ENV !== "production") holder.__districtDb = db;

export type Tx = Prisma.TransactionClient;
export { Prisma };

export const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
