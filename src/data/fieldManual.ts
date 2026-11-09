import { counteredBy, poorAgainst, resists, strongAgainst } from './counters';
import { ENEMY_NAMES, ENEMY_WEAKNESS, LAYER_NAME, LEVEL_NAME, TOWER_NAMES, TOWER_ROLES } from './display';
import { ENEMY_STATS, NOT_IN_PLAY, type EnemyKind } from './enemies';
import { TOWER_LEVELS, TOWER_STATS, type TowerKind } from './towers';

/**
 * What each kind is, in one descriptive line under its name in the Field manual. Generic classes only: never a real
 * designation or trade name (ADR-0009), which a test checks against `scripts/render-sprite.json`.
 */
export const CLASS_LINES = {
  rifleNest: 'Infantry fire team: assault rifles and a light machine gun behind sandbags',
  aaGun: 'Light anti-aircraft mount: a rapid-fire automatic gun on a towed carriage',
  cannon: 'Anti-tank gun position: armor-piercing rounds from a tripod or a towed carriage',
  mortar: 'Medium mortar on a bipod and baseplate, dug into a sandbagged pit',
  infantry: 'Rifle squad on foot: assault rifles, body armor and helmets',
  jeep: 'Light four-wheel-drive utility vehicle, unarmored',
  helicopter: 'Medium transport helicopter: twin turbines, a light armored cabin',
  apc: 'Armored personnel carrier: wheeled hull with a troop compartment, carries a rifle squad',
  tank: 'Main battle tank: large-calibre gun, heavy composite armor',
} as const satisfies Record<TowerKind | EnemyKind, string>;

/** One Field manual entry: a tower or an enemy kind, with everything its info side shows. */
export interface FieldManualEntry {
  readonly group: 'tower' | 'enemy';
  readonly kind: TowerKind | EnemyKind;
  readonly name: string;
  readonly classLine: string;
  /** The role line (towers, #245) or what hurts it (enemies). */
  readonly role: string;
  /** Label and value, in order: the stats from `src/data`. */
  readonly stats: readonly (readonly [string, string])[];
  /** "Effective against" (towers) or "Weak against" (enemies), from the counter matrix. */
  readonly effectiveLabel: string;
  readonly effective: readonly string[];
  /** "Weak against" (towers) or "Shrugs off" (enemies). */
  readonly weakLabel: string;
  readonly weak: readonly string[];
}

/** A number as the player reads it: at most two decimals, no trailing zeros. */
const num = (n: number) => String(Math.round(n * 100) / 100);

function towerEntry(kind: TowerKind): FieldManualEntry {
  const stats: {
    cost: number;
    damage: number;
    range: number;
    fireRate: number;
    targets: readonly ('ground' | 'air')[];
    armorPierce?: number;
    minRange?: number;
  } = TOWER_STATS[kind];
  const rows: [string, string][] = [
    ['Cost', num(stats.cost)],
    ['Damage', num(stats.damage)],
    ['Range', `${num(stats.range)} tiles`],
    ['Fire rate', `${num(stats.fireRate)} shots/s`],
    ['Targets', stats.targets.map((layer) => LAYER_NAME[layer]).join(', ')],
  ];
  if (stats.minRange !== undefined) rows.push(['Minimum range', `${num(stats.minRange)} tiles`]);
  if (stats.armorPierce !== undefined) rows.push(['Armor pierce', num(stats.armorPierce)]);
  rows.push(['Upgrades', TOWER_LEVELS[kind].map((level, i) => `${LEVEL_NAME[i + 2]} (${level.cost})`).join(', ')]);
  return {
    group: 'tower',
    kind,
    name: TOWER_NAMES[kind],
    classLine: CLASS_LINES[kind],
    role: TOWER_ROLES[kind],
    stats: rows,
    effectiveLabel: 'Effective against',
    effective: strongAgainst(kind).map((enemy) => ENEMY_NAMES[enemy]),
    weakLabel: 'Weak against',
    weak: poorAgainst(kind).map((enemy) => ENEMY_NAMES[enemy]),
  };
}

function enemyEntry(kind: EnemyKind): FieldManualEntry {
  const stats = ENEMY_STATS[kind];
  return {
    group: 'enemy',
    kind,
    name: ENEMY_NAMES[kind],
    classLine: CLASS_LINES[kind],
    role: ENEMY_WEAKNESS[kind],
    stats: [
      ['HP', num(stats.maxHp)],
      ['Armor', num(stats.armor)],
      ['Speed', `${num(stats.speed)} tiles/s`],
      ['Layer', LAYER_NAME[stats.layer]],
      ['Leak cost', `${stats.leakCost} ${stats.leakCost === 1 ? 'Life' : 'Lives'}`],
    ],
    effectiveLabel: 'Weak against',
    effective: counteredBy(kind).map((tower) => TOWER_NAMES[tower]),
    weakLabel: 'Shrugs off',
    weak: resists(kind).map((tower) => TOWER_NAMES[tower]),
  };
}

/** Every Field manual entry: the towers, then the enemy kinds, in data order. */
export function fieldManualEntries(): FieldManualEntry[] {
  return [
    ...(Object.keys(TOWER_STATS) as TowerKind[]).map(towerEntry),
    ...(Object.keys(ENEMY_STATS) as EnemyKind[]).filter((k) => !NOT_IN_PLAY.includes(k)).map(enemyEntry),
  ];
}
