import { TOWER_STATS, type TowerKind } from '../data/towers';
import type { Tile } from './map';
import { ZERO, waveDps, type CombatStats, type DamageCount } from './stats';

/** Damage, kills and damage per second, for one row of the damage report. */
export interface ReportFigures extends DamageCount {
  readonly dps: number;
}

export interface TowerReportRow extends ReportFigures {
  readonly towerId: number;
  readonly kind: TowerKind;
  readonly tile: Tile;
  readonly sold: boolean;
}

export interface KindReportRow extends ReportFigures {
  readonly kind: TowerKind;
  /** How many towers of the kind were placed, sold ones too. */
  readonly towers: number;
}

export interface WaveReportRow extends ReportFigures {
  readonly waveNumber: number;
  readonly elapsedMs: number;
}

/** The End screen's breakdown (GLOSSARY: Damage report). */
export interface DamageReport {
  /** Every tower placed, sold ones too, in placement order. */
  readonly towers: readonly TowerReportRow[];
  /** Each kind placed, in the build bar's order. */
  readonly kinds: readonly KindReportRow[];
  /** Each finished wave, in order. */
  readonly waves: readonly WaveReportRow[];
  /** The whole game; `elapsedMs` is every finished wave's duration added up. */
  readonly total: ReportFigures & { readonly elapsedMs: number };
}

/** Damage per second, or 0 for no time at all (a tower that never stood in a wave). */
const dps = (damage: number, elapsedMs: number): number => (elapsedMs > 0 ? waveDps(damage, elapsedMs) : 0);

/**
 * The damage report from the stats. A tower's DPS is its damage over the wave time it stood; a wave's, its damage
 * over the wave's duration; a kind's and the total, their damage over the game's wave time.
 */
export function damageReport(stats: CombatStats): DamageReport {
  const elapsedMs = stats.waves.reduce((sum, wave) => sum + wave.elapsedMs, 0);
  // Integer keys come back in ascending order, which is placement order: ids only grow.
  const towers = Object.entries(stats.placed).map(([id, { kind, tile, waveMs, sold }]): TowerReportRow => {
    const { damage, kills } = stats.towers[Number(id)]?.total ?? ZERO;
    return { towerId: Number(id), kind, tile, sold, damage, kills, dps: dps(damage, waveMs) };
  });
  const kinds = (Object.keys(TOWER_STATS) as TowerKind[]).flatMap((kind): KindReportRow[] => {
    const ofKind = towers.filter((tower) => tower.kind === kind);
    if (ofKind.length === 0) return [];
    const damage = ofKind.reduce((sum, tower) => sum + tower.damage, 0);
    const kills = ofKind.reduce((sum, tower) => sum + tower.kills, 0);
    return [{ kind, towers: ofKind.length, damage, kills, dps: dps(damage, elapsedMs) }];
  });
  const waves = stats.waves.map(({ waveNumber, elapsedMs: ms, damage, kills }): WaveReportRow => ({
    waveNumber,
    elapsedMs: ms,
    damage,
    kills,
    dps: dps(damage, ms),
  }));
  const { damage, kills } = stats.total;
  return { towers, kinds, waves, total: { elapsedMs, damage, kills, dps: dps(damage, elapsedMs) } };
}
