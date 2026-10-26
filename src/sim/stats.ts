import type { Shot } from './towers';

export interface DamageCount {
  readonly damage: number;
  readonly kills: number;
}

export interface CombatStats {
  readonly total: DamageCount;
  readonly wave: DamageCount & { readonly elapsedMs: number };
  /** By tower id. A plain record, so it survives `npm run scenario -- --json` and `__TD__.state()`. */
  readonly towers: Readonly<Record<number, { readonly total: DamageCount; readonly wave: DamageCount }>>;
}

const ZERO: DamageCount = { damage: 0, kills: 0 };

export const emptyStats = (): CombatStats => ({ total: ZERO, wave: { ...ZERO, elapsedMs: 0 }, towers: {} });

const add = (count: DamageCount, damage: number, kills: number): DamageCount => ({
  damage: count.damage + damage,
  kills: count.kills + kills,
});

/**
 * Adds a tick's shots, in firing order. Each hit's damage counts for its tower.
 * An enemy in `killedIds` died to the last shot that hit it, and that hit's tower gets the kill.
 */
export function recordShots(stats: CombatStats, shots: readonly Shot[], killedIds: ReadonlySet<number>): CombatStats {
  const killer = new Map<number, number>();
  for (const { towerId, hits } of shots)
    for (const { enemyId } of hits) if (killedIds.has(enemyId)) killer.set(enemyId, towerId);
  let { total, wave, towers } = stats;
  for (const { towerId, hits } of shots) {
    const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
    const kills = hits.filter((hit) => killer.get(hit.enemyId) === towerId).length;
    const entry = towers[towerId] ?? { total: ZERO, wave: ZERO };
    towers = { ...towers, [towerId]: { total: add(entry.total, damage, kills), wave: add(entry.wave, damage, kills) } };
    total = add(total, damage, kills);
    wave = { ...wave, ...add(wave, damage, kills) };
  }
  return { total, wave, towers };
}

/** A new wave: wave figures back to 0, totals kept. */
export function resetWave(stats: CombatStats): CombatStats {
  const towers = Object.fromEntries(
    Object.entries(stats.towers).map(([id, t]) => [id, { total: t.total, wave: ZERO }]),
  );
  return { total: stats.total, wave: { ...ZERO, elapsedMs: 0 }, towers };
}

export const withWaveElapsed = (stats: CombatStats, elapsedMs: number): CombatStats => ({
  ...stats,
  wave: { ...stats.wave, elapsedMs },
});

/** Damage per second over `elapsedMs`, with the time floored at 1 s so a wave's first hit isn't a spike. */
export const waveDps = (damage: number, elapsedMs: number): number => damage / Math.max(elapsedMs / 1000, 1);
