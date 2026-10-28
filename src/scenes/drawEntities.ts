import {
  AIR_SHADOW,
  EFFECT,
  DISMANTLE,
  ENEMY_STYLE,
  GHOST,
  HP_BAR,
  LEVEL_PIP,
  RANGE_RING,
  ROTOR,
  SHELL,
  TILE_PX,
  TOWER_STYLE,
  TRACER_STYLE,
  type TowerStyle,
} from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower, TowerStats } from '../sim/towers';
import type { MapPainter } from './drawMap';
import type { Pixel } from './coords';
import type { EffectView } from './effects';
import type { BlastCircle } from './shellView';
import type { TracerLine } from './tracers';

/** The part of Phaser's Graphics that the entity drawers use, so tests can pass a recording fake. */
export interface EntityPainter extends MapPainter {
  fillCircle(x: number, y: number, radius: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
}

// Enemies, towers, ghosts and range rings are drawn around the local origin; the scene positions each one's Graphics.

/** A circle or square in its kind's color (air kinds get an offset shadow, rotor kinds an X), with its HP bar. */
export function drawEnemy(painter: EntityPainter, enemy: Enemy): void {
  const style = ENEMY_STYLE[enemy.kind];
  const { shape, radius, color } = style;
  if (enemy.layer === 'air') {
    painter.fillStyle(AIR_SHADOW.color, AIR_SHADOW.alpha);
    painter.fillCircle(AIR_SHADOW.offsetX, AIR_SHADOW.offsetY, radius);
  }
  painter.fillStyle(color);
  if (shape === 'circle') painter.fillCircle(0, 0, radius);
  else painter.fillRect(-radius, -radius, radius * 2, radius * 2);
  if ('rotor' in style) {
    const s = style.rotor;
    painter.lineStyle(ROTOR.width, ROTOR.color);
    painter.lineBetween(-s, -s, s, s);
    painter.lineBetween(-s, s, s, -s);
  }
  drawHpBar(painter, enemy);
}

/** The HP bar centered above the enemy, filled in proportion to HP left. Drawn over its sprite too. */
export function drawHpBar(painter: EntityPainter, enemy: Enemy): void {
  const { radius } = ENEMY_STYLE[enemy.kind];
  const left = -HP_BAR.width / 2;
  const top = -radius - HP_BAR.gap - HP_BAR.height;
  painter.fillStyle(HP_BAR.back, HP_BAR.backAlpha);
  painter.fillRect(left, top, HP_BAR.width, HP_BAR.height);
  painter.fillStyle(HP_BAR.fill);
  painter.fillRect(left, top, (HP_BAR.width * enemy.hp) / enemy.maxHp, HP_BAR.height);
}

/** Fills, or with `stroke` outlines, a kind's shape centered on the origin, in the current style. */
function paintShape(painter: EntityPainter, { shape, size }: TowerStyle, stroke = false): void {
  const half = size / 2;
  if (shape === 'circle') {
    if (stroke) painter.strokeCircle(0, 0, half);
    else painter.fillCircle(0, 0, half);
  } else if (stroke) painter.strokeRect(-half, -half, size, size);
  else painter.fillRect(-half, -half, size, size);
}

/** A filled shape with an outline, in its kind's style, and its level pips. */
export function drawTower(painter: EntityPainter, tower: Tower): void {
  const style = TOWER_STYLE[tower.kind];
  painter.fillStyle(style.fill);
  paintShape(painter, style);
  painter.lineStyle(style.outlineWidth, style.outline);
  paintShape(painter, style, true);
  drawLevelPips(painter, tower);
}

/** A level pip per upgrade along the bottom edge of the tower's shape. Drawn over its sprite too. */
export function drawLevelPips(painter: EntityPainter, tower: Tower): void {
  if (tower.level <= 1) return;
  const style = TOWER_STYLE[tower.kind];
  const half = style.size / 2;
  const top = half - LEVEL_PIP.inset - LEVEL_PIP.size;
  painter.fillStyle(LEVEL_PIP.color);
  for (let i = 0; i < tower.level - 1; i++) {
    const left = -half + LEVEL_PIP.inset + i * (LEVEL_PIP.size + LEVEL_PIP.gap);
    painter.fillRect(left, top, LEVEL_PIP.size, LEVEL_PIP.size);
  }
}

/** The range rings' radii in pixels: the range, then the minimum range (the dead zone's edge) if there is one. */
export function rangeRingRadii({ range, minRange }: TowerStats): number[] {
  return minRange === undefined ? [range * TILE_PX] : [range * TILE_PX, minRange * TILE_PX];
}

/** The ring around a dismantling tower; `left` is the share of the dismantle time still to go (1 down to 0). */
export function drawDismantleRing(painter: EntityPainter, left: number): void {
  painter.lineStyle(DISMANTLE.width, DISMANTLE.color);
  painter.strokeCircle(0, 0, DISMANTLE.radius * left);
}

/** The circle a tower can hit within, and the dead zone inside it if it has a minimum range. */
export function drawRangeRing(painter: EntityPainter, tower: Tower): void {
  painter.lineStyle(RANGE_RING.width, RANGE_RING.color, RANGE_RING.alpha);
  for (const radius of rangeRingRadii(tower)) painter.strokeCircle(0, 0, radius);
}

/** A see-through tower of `kind` and its range rings, green if it can be placed here, red if not. */
export function drawGhost(painter: EntityPainter, kind: TowerKind, placeable: boolean): void {
  const color = placeable ? GHOST.placeable : GHOST.blocked;
  const radii = rangeRingRadii(TOWER_STATS[kind]);
  painter.fillStyle(color, GHOST.fillAlpha);
  paintShape(painter, TOWER_STYLE[kind]);
  // The dark outline goes under the coloured ring, so the ring keeps its colour with a dark edge either side.
  painter.lineStyle(GHOST.outline.width, GHOST.outline.color, GHOST.outline.alpha);
  paintShape(painter, TOWER_STYLE[kind], true);
  for (const radius of radii) painter.strokeCircle(0, 0, radius);
  painter.lineStyle(GHOST.ringWidth, color, GHOST.ringAlpha);
  for (const radius of radii) painter.strokeCircle(0, 0, radius);
}

/** Each tracer as a line in canvas pixels, in its tower's style, at its current alpha. */
export function drawTracers(painter: EntityPainter, tracers: readonly TracerLine[]): void {
  for (const { from, to, kind, alpha } of tracers) {
    painter.lineStyle(TRACER_STYLE[kind].width, TRACER_STYLE[kind].color, alpha);
    painter.lineBetween(from.x, from.y, to.x, to.y);
  }
}

/** Each shell in flight as a dot at its canvas position. */
export function drawShells(painter: EntityPainter, shells: readonly Pixel[]): void {
  painter.fillStyle(SHELL.color);
  for (const { x, y } of shells) painter.fillCircle(x, y, SHELL.radius);
}

/** Each blast as a circle outline at its outer ring, at its current alpha. */
export function drawBlasts(painter: EntityPainter, blasts: readonly BlastCircle[]): void {
  for (const { center, radius, alpha } of blasts) {
    painter.lineStyle(SHELL.blastWidth, SHELL.blastColor, alpha);
    painter.strokeCircle(center.x, center.y, radius);
  }
}

/** Each combat effect as a disc that fades out and grows as it ages. */
export function drawEffects(painter: EntityPainter, effects: readonly EffectView[]): void {
  for (const { kind, at, progress } of effects) {
    const { color, radius, growth } = EFFECT[kind];
    painter.fillStyle(color, 1 - progress);
    painter.fillCircle(at.x, at.y, radius * (1 + (growth - 1) * progress));
  }
}
