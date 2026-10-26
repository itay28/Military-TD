import {
  ENEMY_STYLE,
  GHOST,
  HP_BAR,
  RANGE_RING,
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
import type { BlastCircle } from './shellView';
import type { TracerLine } from './tracers';

/** The part of Phaser's Graphics that the entity drawers use, so tests can pass a recording fake. */
export interface EntityPainter extends MapPainter {
  fillCircle(x: number, y: number, radius: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
}

// Enemies, towers, ghosts and range rings are drawn around the local origin; the scene positions each one's Graphics.

/** A circle or square in its kind's color, with an HP bar above it filled in proportion to HP left. */
export function drawEnemy(painter: EntityPainter, enemy: Enemy): void {
  const { shape, radius, color } = ENEMY_STYLE[enemy.kind];
  painter.fillStyle(color);
  if (shape === 'circle') painter.fillCircle(0, 0, radius);
  else painter.fillRect(-radius, -radius, radius * 2, radius * 2);

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

/** A filled shape with an outline, in its kind's style. */
export function drawTower(painter: EntityPainter, tower: Tower): void {
  const style = TOWER_STYLE[tower.kind];
  painter.fillStyle(style.fill);
  paintShape(painter, style);
  painter.lineStyle(style.outlineWidth, style.outline);
  paintShape(painter, style, true);
}

/** The range rings' radii in pixels: the range, then the minimum range (the dead zone's edge) if there is one. */
export function rangeRingRadii({ range, minRange }: TowerStats): number[] {
  return minRange === undefined ? [range * TILE_PX] : [range * TILE_PX, minRange * TILE_PX];
}

/** The circle a tower can hit within, and the dead zone inside it if it has a minimum range. */
export function drawRangeRing(painter: EntityPainter, tower: Tower): void {
  painter.lineStyle(RANGE_RING.width, RANGE_RING.color, RANGE_RING.alpha);
  for (const radius of rangeRingRadii(tower)) painter.strokeCircle(0, 0, radius);
}

/** A see-through tower of `kind` and its range rings, green if it can be placed here, red if not. */
export function drawGhost(painter: EntityPainter, kind: TowerKind, placeable: boolean): void {
  const color = placeable ? GHOST.placeable : GHOST.blocked;
  painter.fillStyle(color, GHOST.fillAlpha);
  paintShape(painter, TOWER_STYLE[kind]);
  painter.lineStyle(GHOST.ringWidth, color, GHOST.ringAlpha);
  for (const radius of rangeRingRadii(TOWER_STATS[kind])) painter.strokeCircle(0, 0, radius);
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
