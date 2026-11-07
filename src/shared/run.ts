/** Ash Run: the numbers the client plays by and the server checks against. */
export const RUN = {
  coinValue: 5,
  baseSpeed: 15,
  topSpeed: 34,
  /** Adrenaline multiplies speed by this much while it lasts. */
  boostFactor: 1.6,
  maxRunMs: 2 * 3600_000,
  /** How long a player has to sign the start message. */
  signWindowMs: 10 * 60_000,
};

/**
 * What the wallet signs before a run. Gas-free: it proves the wallet holder started
 * this run on this site, and nothing else.
 */
export function runMessage(host: string, address: string, run: string) {
  return [
    `${host} asks you to start an Ash Run in The Last District as:`,
    address,
    "",
    "Signing starts one run. It costs nothing, sends no transaction and can't move, approve or lock any Squeek.",
    "",
    "Chain: Sepolia (11155111)",
    `Run: ${run}`,
  ].join("\n");
}

/** Speed (m/s) at a given distance: ramps from base to top, never past it. */
export const speedAt = (distance: number) => RUN.baseSpeed + (RUN.topSpeed - RUN.baseSpeed) * (1 - Math.exp(-distance / 1800));

/** The server never takes a score from the client: it recomputes it from distance and coins. */
export const runScore = (distance: number, coins: number) => Math.floor(distance) + coins * RUN.coinValue;

/**
 * A plausibility check, not a replay. It rejects runs that went further than the
 * fastest possible pace allows in the time since the server started them, or that
 * picked up more coins than the track can hold over that distance.
 */
export function implausible({ distance, coins, elapsedMs }: { distance: number; coins: number; elapsedMs: number }): string | null {
  if (!Number.isFinite(distance) || !Number.isFinite(coins) || distance < 0 || coins < 0) return "bad_numbers";
  if (elapsedMs < 0 || elapsedMs > RUN.maxRunMs) return "expired";
  if (distance > (elapsedMs / 1000) * RUN.topSpeed * RUN.boostFactor + 25) return "too_fast";
  // Coins sit at most one line per row, 2.8 m apart; Double counts each twice.
  if (coins > (distance / 2.8) * 2 + 10) return "too_many_coins";
  return null;
}
