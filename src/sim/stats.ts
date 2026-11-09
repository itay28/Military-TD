import type { TowerKind } from '../data/towers';
import type { Tile } from './map';
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
  /** Every tower ever placed, by id, sold ones too: what the damage report lists. */
  readonly placed: Readonly<Record<number, PlacedTower>>;
  /** Each finished wave (cleared, or lost at Defeat), in the order they finished. */
  readonly waves: readonly WaveRecord[];
  /** Each wave still on the field, by wave number: its figures so far. Waves can overlap (ADR-0011). */
  readonly running: Readonly<Record<number, WaveRecord>>;
  /** Game time with at least one wave on the field: overlapping waves count once. */
  readonly waveTimeMs: number;
}

export interface PlacedTower {
  readonly kind: TowerKind;
  readonly tile: Tile;
  /** Time the tower stood (dismantling too) while a wave ran: what its DPS divides by. */
  readonly waveMs: number;
  /** It finished dismantling and left the map. */
  readonly sold: boolean;
}

/** One finished wave's figures, overall and by tower id. */
export interface WaveRecord extends DamageCount {
  readonly waveNumber: number;
  readonly elapsedMs: number;
  readonly towers: Readonly<Record<number, DamageCount>>;
}

export const ZERO: DamageCount = { damage: 0, kills: 0 };

export const emptyStats = (): CombatStats => ({
  total: ZERO,
  wave: { ...ZERO, elapsedMs: 0 },
  towers: {},
  placed: {},
  waves: [],
  running: {},
  waveTimeMs: 0,
});

const add = (count: DamageCount, damage: number, kills: number): DamageCount => ({
  damage: count.damage + damage,
  kills: count.kills + kills,
});

/** What a shot or a shell landing adds: its tower and every enemy it damaged. */
export type Strike = Pick<Shot, 'towerId' | 'hits'>;

/**
 * Adds a tick's shots and shell landings, in the order they hit. Each hit's damage counts for its tower, and for
 * the hit enemy's wave (`waveOf`; none for an enemy spawned outside a wave). An enemy in `killedIds` died to the
 * last shot that hit it, and that hit's tower gets the kill.
 */
export function recordShots(
  stats: CombatStats,
  shots: readonly Strike[],
  killedIds: ReadonlySet<number>,
  waveOf: (enemyId: number) => number | undefined = () => undefined,
): CombatStats {
  const killer = new Map<number, number>();
  for (const { towerId, hits } of shots)
    for (const { enemyId } of hits) if (killedIds.has(enemyId)) killer.set(enemyId, towerId);
  let { total, wave, towers, running } = stats;
  for (const { towerId, hits } of shots) {
    const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
    const kills = hits.filter((hit) => killer.get(hit.enemyId) === towerId).length;
    const entry = towers[towerId] ?? { total: ZERO, wave: ZERO };
    towers = { ...towers, [towerId]: { total: add(entry.total, damage, kills), wave: add(entry.wave, damage, kills) } };
    total = add(total, damage, kills);
    wave = { ...wave, ...add(wave, damage, kills) };
    for (const hit of hits) {
      const record = running[waveOf(hit.enemyId) ?? -1];
      if (!record) continue;
      const kill = killer.get(hit.enemyId) === towerId ? 1 : 0;
      running = {
        ...running,
        [record.waveNumber]: {
          ...record,
          ...add(record, hit.damage, kill),
          towers: { ...record.towers, [towerId]: add(record.towers[towerId] ?? ZERO, hit.damage, kill) },
        },
      };
    }
  }
  return { ...stats, total, wave, towers, running };
}

/** Wave `waveNumber` starts: it gets its own figures, and the latest-wave figures go back to 0; totals are kept. */
export function startWaveStats(stats: CombatStats, waveNumber: number): CombatStats {
  const towers = Object.fromEntries(
    Object.entries(stats.towers).map(([id, t]) => [id, { total: t.total, wave: ZERO }]),
  );
  const record: WaveRecord = { waveNumber, ...ZERO, elapsedMs: 0, towers: {} };
  return { ...stats, wave: { ...ZERO, elapsedMs: 0 }, towers, running: { ...stats.running, [waveNumber]: record } };
}

/** A newly placed tower joins the list. */
export const addTower = (stats: CombatStats, towerId: number, kind: TowerKind, tile: Tile): CombatStats => ({
  ...stats,
  placed: { ...stats.placed, [towerId]: { kind, tile, waveMs: 0, sold: false } },
});

const updatePlaced = (stats: CombatStats, towerId: number, change: (tower: PlacedTower) => PlacedTower) => {
  const tower = stats.placed[towerId];
  return tower ? { ...stats, placed: { ...stats.placed, [towerId]: change(tower) } } : stats;
};

/** A tower finished dismantling: it stays listed, marked sold. */
export const markSold = (stats: CombatStats, towerId: number): CombatStats =>
  updatePlaced(stats, towerId, (tower) => ({ ...tower, sold: true }));

/** `dtMs` of wave time passed (with one wave or more on the field) with `towerIds` standing. */
export const addWaveTime = (stats: CombatStats, towerIds: readonly number[], dtMs: number): CombatStats =>
  towerIds.reduce((acc, id) => updatePlaced(acc, id, (tower) => ({ ...tower, waveMs: tower.waveMs + dtMs })), {
    ...stats,
    waveTimeMs: stats.waveTimeMs + dtMs,
  });

/** The wave `waveNumber` ended (cleared, or lost at Defeat): its figures, overall and per tower, join the history. */
export function endWave(stats: CombatStats, waveNumber: number): CombatStats {
  const { [waveNumber]: record, ...running } = stats.running;
  if (!record) return stats;
  // A tower that hit nothing in this wave shows 0 for it.
  const towers = Object.fromEntries(Object.keys(stats.towers).map((id) => [id, record.towers[Number(id)] ?? ZERO]));
  return { ...stats, running, waves: [...stats.waves, { ...record, towers }] };
}

/** Sets how long wave `waveNumber` has run; the latest-wave figures take `latest`'s time. */
export const withWaveElapsed = (
  stats: CombatStats,
  elapsedByWave: ReadonlyMap<number, number>,
  latest: number,
): CombatStats => ({
  ...stats,
  wave: { ...stats.wave, elapsedMs: elapsedByWave.get(latest) ?? stats.wave.elapsedMs },
  running: Object.fromEntries(
    Object.entries(stats.running).map(([n, record]) => [
      n,
      { ...record, elapsedMs: elapsedByWave.get(Number(n)) ?? record.elapsedMs },
    ]),
  ),
});

/** Damage per second over `elapsedMs`, with the time floored at 1 s so a wave's first hit isn't a spike. */
export const waveDps = (damage: number, elapsedMs: number): number => damage / Math.max(elapsedMs / 1000, 1);
