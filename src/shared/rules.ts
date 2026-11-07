/**
 * The published game rules. Everything a player needs to know about why a shelter qualifies lives
 * here, and the server and the browser read the same numbers. No hidden multipliers.
 */

export const RULES = {
  /** Shelters one player may run at once. */
  maxShelters: 5,
  /** Base beds before the primary's level is added. Capacity counts the primary. */
  baseCapacity: 3,
  /** A Survivor that just joined a shelter can't be moved to another for this long. */
  moveCooldownMinutes: 60,
  nameMin: 3,
  nameMax: 28,
  /** Days a winner has to claim a reward. */
  claimDays: 14,
  /** Default supply drop cadence. */
  dropIntervalHours: 72,
  /** Defaults for a new drop; an admin can change them before it opens. */
  defaultMinSurvivors: 3,
  defaultMinResidencyHours: 12,
  /** Sepolia blocks between the snapshot and the block whose hash seeds the draw. */
  entropyDelayBlocks: 3,
  /** Confirmations on the entropy block before it is used. */
  entropyConfirmations: 2,
} as const;

/** Beds in a shelter, counting its primary: 4 for a Level 1 primary, up to 13 at Level 10. */
export const capacityFor = (primaryLevel: number) => RULES.baseCapacity + Math.max(1, Math.min(10, primaryLevel));

/** Development tiers. Points come only from supply drops: 10 per drop a shelter qualifies for, plus 1 per Survivor counted. Cosmetic only. */
export const TIERS = [
  { tier: 1, name: "Dugout", minXp: 0, theme: "bunker" },
  { tier: 2, name: "Bunker", minXp: 30, theme: "greenhouse" },
  { tier: 3, name: "Stronghold", minXp: 90, theme: "radio" },
  { tier: 4, name: "Bastion", minXp: 200, theme: "foundry" },
  { tier: 5, name: "Citadel", minXp: 400, theme: "beacon" },
] as const;

export const tierFor = (xp: number) => [...TIERS].reverse().find((t) => xp >= t.minXp) ?? TIERS[0];
export const nextTier = (xp: number) => TIERS.find((t) => t.minXp > xp) ?? null;

export const THEMES: Record<string, { name: string; tier: number; blurb: string }> = {
  bunker: { name: "Concrete Bunker", tier: 1, blurb: "Poured walls, one bulb, a door that sticks." },
  greenhouse: { name: "Grow Room", tier: 2, blurb: "Grow lights over seed trays salvaged from the ruins." },
  radio: { name: "Signal Post", tier: 3, blurb: "An antenna mast and a radio that still picks up the convoys." },
  foundry: { name: "Workshop", tier: 4, blurb: "Welding rigs, spare plating and a forge that runs on scrap." },
  beacon: { name: "Beacon Tower", tier: 5, blurb: "A lit tower the whole district can see at night." },
};

export const shelterXpForDrop = (counted: number) => 10 + counted;
export const playerXpForDrop = (tickets: number) => 5 + tickets;

export const BADGES: Record<string, { name: string; how: string }> = {
  founder: { name: "Founder", how: "Establish your first shelter." },
  full_house: { name: "Full House", how: "Fill a shelter to capacity." },
  network: { name: "Network Builder", how: "Run three shelters at once." },
  collector: { name: "Collector", how: "Hold ten or more Survivors." },
  first_drop: { name: "First Signal", how: "Qualify for a supply drop." },
  veteran: { name: "Drop Veteran", how: "Qualify for five supply drops." },
  crate_cracker: { name: "Crate Cracker", how: "Win a reward in a supply drop." },
};

export const RESOURCE_LABELS: Record<string, string> = {
  rations: "Ration crates",
  water: "Water drums",
};

export const DROP_NAMES = [
  "Ration Run", "Night Convoy", "Signal Flare", "Rooftop Cache", "Dust Storm Drop", "Pipeline Haul",
  "Static Broadcast", "Iron Rain", "Lantern Route", "Floodgate Supply", "Cold Front", "Ember Line",
];

export type DropRules = { minSurvivors: number; minResidencyHours: number; ticketRule: "PER_SURVIVOR" | "FLAT"; maxWinsPerPlayer: number };

/** The rules in plain words, as shown on every drop page. */
export function describeRules(r: DropRules): string[] {
  return [
    `A shelter qualifies with at least ${r.minSurvivors} Survivors counted, its primary included.`,
    `A Survivor counts only if it was in the shelter at least ${r.minResidencyHours} hours before the snapshot, and the shelter's owner still holds it at the snapshot (in their wallet or deposited in SqueekStaking).`,
    r.ticketRule === "PER_SURVIVOR"
      ? "Each counted Survivor is one ticket for its shelter."
      : "Each qualifying shelter holds one ticket, however large it is.",
    "A shelter can win at most one reward per drop.",
    `A player can win at most ${r.maxWinsPerPlayer} reward${r.maxWinsPerPlayer === 1 ? "" : "s"} per drop.`,
    "Every qualifying shelter receives a ration crate and water, win or not.",
  ];
}
