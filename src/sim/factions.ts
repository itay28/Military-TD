// Factions (ADR-0009): the sides a map pits against each other. Visual skins only: a kind has the same stats in every
// Faction, so nothing in the rules reads them.

/** Every Faction, as written in a map file's `attacker` and `defender` properties. */
export const FACTIONS = ['us', 'russia', 'china', 'insurgents'] as const;

export type Faction = (typeof FACTIONS)[number];

export const isFaction = (value: unknown): value is Faction => (FACTIONS as readonly unknown[]).includes(value);
