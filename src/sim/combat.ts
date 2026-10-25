/** Where an enemy moves: on the ground or in the air. A tower hits only the layers it lists in `targets`. */
export type Layer = 'ground' | 'air';

/**
 * HP a hit removes: `max(1, damage − max(0, armor − pierce))`, capped at `hpLeft`.
 * Armor takes a flat amount off each hit; pierce cancels armor up to its value but never adds damage.
 */
export function damageTaken(damage: number, armor: number, pierce: number, hpLeft: number): number {
  const effectiveArmor = Math.max(0, armor - pierce);
  return Math.min(hpLeft, Math.max(1, damage - effectiveArmor));
}
