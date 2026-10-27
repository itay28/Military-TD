/** The player's game speeds, in cycle order. Each multiplies the sim time a real frame feeds the fixed step. */
export const GAME_SPEEDS = [1, 2, 4] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];
export const MAX_GAME_SPEED: GameSpeed = 4;

/** The next speed in the cycle, wrapping ×4 back to ×1. */
export function nextSpeed(speed: GameSpeed): GameSpeed {
  return GAME_SPEEDS[(GAME_SPEEDS.indexOf(speed) + 1) % GAME_SPEEDS.length]!;
}
