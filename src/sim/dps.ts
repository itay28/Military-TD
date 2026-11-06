import { TOWER_STATS, type TowerKind } from '../data/towers';
import { ZERO, waveDps, type CombatStats, type DamageCount } from './stats';
import type { Tower } from './towers';

/** Which figures the DPS meter shows: the current (or last) wave's, or the whole game's. */
export type DpsScope = 'wave' | 'total';

export interface DpsFigures extends DamageCount {
  readonly dps: number;
}

export interface DpsTowerRow extends DpsFigures {
  readonly towerId: number;
  /** Its level while it stands; undefined once sold. */
  readonly level: number | undefined;
  /** It was sold: dismantling, or gone. */
  readonly sold: boolean;
}

export interface DpsKindRow extends DpsFigures {
  readonly kind: TowerKind;
  /** Its part of the scope's damage, 0 to 1; 0 when nothing was dealt. */
  readonly share: number;
  /** Its towers, by DPS. */
  readonly towers: readonly DpsTowerRow[];
}

/** The DPS meter's figures (GLOSSARY: DPS meter). */
export interface DpsBreakdown extends DpsFigures {
  /** Each placed kind, by DPS. */
  readonly kinds: readonly DpsKindRow[];
}

const KIND_ORDER = Object.keys(TOWER_STATS) as TowerKind[];

/**
 * The DPS meter's rows: one per tower kind and, under each, one per tower, each sorted by DPS (ties: build-bar order,
 * then placement order). Every row's DPS is its damage over the same `elapsedMs`, so towers add up to their kind and
 * kinds to the total. A sold tower keeps its damage, marked sold, but is left out when it dealt nothing in the scope.
 */
export function dpsBreakdown(
  stats: CombatStats,
  towers: readonly Pick<Tower, 'id' | 'level' | 'dismantleMs'>[],
  elapsedMs: number,
  scope: DpsScope = 'wave',
): DpsBreakdown {
  const dps = (damage: number) => waveDps(damage, elapsedMs);
  const standing = new Map(towers.filter((t) => t.dismantleMs === undefined).map((t) => [t.id, t.level]));
  // Integer keys come back in ascending order, which is placement order: ids only grow.
  const byKind = new Map<TowerKind, DpsTowerRow[]>();
  for (const [key, placed] of Object.entries(stats.placed)) {
    const towerId = Number(key);
    const { damage, kills } = stats.towers[towerId]?.[scope] ?? ZERO;
    const level = standing.get(towerId);
    const sold = placed.sold || level === undefined;
    if (sold && damage === 0 && kills === 0) continue;
    const row = { towerId, level, dps: dps(damage), damage, kills, sold };
    byKind.set(placed.kind, [...(byKind.get(placed.kind) ?? []), row]);
  }
  const { damage, kills } = scope === 'wave' ? stats.wave : stats.total;
  const kinds = KIND_ORDER.flatMap((kind): DpsKindRow[] => {
    const ofKind = byKind.get(kind);
    if (!ofKind) return [];
    const kindDamage = ofKind.reduce((sum, row) => sum + row.damage, 0);
    const kindKills = ofKind.reduce((sum, row) => sum + row.kills, 0);
    return [
      {
        kind,
        dps: dps(kindDamage),
        damage: kindDamage,
        kills: kindKills,
        share: damage > 0 ? kindDamage / damage : 0,
        // A stable sort keeps placement order for ties.
        towers: ofKind.sort((a, b) => b.dps - a.dps),
      },
    ];
  });
  return { dps: dps(damage), damage, kills, kinds: kinds.sort((a, b) => b.dps - a.dps) };
}

/** The time the meter divides by: the current (or last) wave's, or, for the whole game, every wave's so far. */
export function meterElapsedMs(stats: CombatStats, scope: DpsScope, inWave: boolean): number {
  if (scope === 'wave') return stats.wave.elapsedMs;
  const finished = stats.waves.reduce((sum, wave) => sum + wave.elapsedMs, 0);
  return finished + (inWave ? stats.wave.elapsedMs : 0);
}
