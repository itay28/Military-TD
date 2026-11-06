import { LAYER_NAME, TOWER_NAMES, TOWER_ROLES } from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import type { Layer } from '../sim/combat';

/** What a build-bar tooltip says about a tower kind: its name, role line, and one row per stat. */
export interface TowerTooltip {
  readonly name: string;
  readonly role: string;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}

/** Ground before Air, whatever order a kind's `targets` list them in. */
const LAYER_ORDER: readonly Layer[] = ['ground', 'air'];

/** The tooltip of `kind` at level 1, read from `src/data`, so it can't drift from the stats. */
export function towerTooltip(kind: TowerKind): TowerTooltip {
  const stats: (typeof TOWER_STATS)[TowerKind] = TOWER_STATS[kind];
  const minRange = 'minRange' in stats ? stats.minRange : undefined;
  const targets: readonly Layer[] = stats.targets;
  return {
    name: TOWER_NAMES[kind],
    role: TOWER_ROLES[kind],
    rows: [
      { label: 'Cost', value: String(stats.cost) },
      { label: 'Damage', value: String(stats.damage) },
      { label: 'Range', value: `${minRange === undefined ? '' : `${minRange}–`}${stats.range} tiles` },
      { label: 'Fire rate', value: `${Number(stats.fireRate.toFixed(2))}/s` },
      {
        label: 'Hits',
        value: LAYER_ORDER.filter((layer) => targets.includes(layer))
          .map((layer) => LAYER_NAME[layer])
          .join(', '),
      },
    ],
  };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Pixels between the tooltip and its button, the screen edge, or the tile it keeps clear. */
export const TIP_GAP = 4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Where a tooltip of size `tip` goes, in page pixels: left of its button `anchor`, top-aligned, inside the viewport.
 * When that would cover `avoid` (the map tile under the pointer or finger), it moves below the tile, or above it
 * when there's no room below.
 */
export function placeTip(anchor: Rect, tip: Size, viewport: Size, avoid?: Rect): { left: number; top: number } {
  const maxTop = viewport.height - TIP_GAP - tip.height;
  const left = clamp(anchor.left - TIP_GAP - tip.width, TIP_GAP, viewport.width - TIP_GAP - tip.width);
  const top = clamp(anchor.top, TIP_GAP, maxTop);
  if (!avoid || !overlaps({ left, top, ...tip }, avoid)) return { left, top };
  const below = avoid.top + avoid.height + TIP_GAP;
  if (below <= maxTop) return { left, top: below };
  return { left, top: Math.max(TIP_GAP, avoid.top - TIP_GAP - tip.height) };
}
