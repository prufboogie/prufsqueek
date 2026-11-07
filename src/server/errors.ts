import { db } from "./db";

export class GameError extends Error {
  constructor(public code: string, public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** Records the message only: requests, seeds and addresses stay out of the log. */
export async function logError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}]`, error);
  try {
    await db.errorLog.create({ data: { scope, message: message.slice(0, 500) } });
  } catch {
    // The log must never take a request down with it.
  }
}
