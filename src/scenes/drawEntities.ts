import { ENEMY_STYLE, GHOST, HP_BAR, RANGE_RING, SHELL, TILE_PX, TOWER_STYLE, TRACER } from '../data/display';
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

/** A circle in its kind's color, with an HP bar above it filled in proportion to HP left. */
export function drawEnemy(painter: EntityPainter, enemy: Enemy): void {
  const { radius, color } = ENEMY_STYLE[enemy.kind];
  painter.fillStyle(color);
  painter.fillCircle(0, 0, radius);

  const left = -HP_BAR.width / 2;
  const top = -radius - HP_BAR.gap - HP_BAR.height;
  painter.fillStyle(HP_BAR.back, HP_BAR.backAlpha);
  painter.fillRect(left, top, HP_BAR.width, HP_BAR.height);
  painter.fillStyle(HP_BAR.fill);
  painter.fillRect(left, top, (HP_BAR.width * enemy.hp) / enemy.maxHp, HP_BAR.height);
}

/** A filled shape with an outline, in its kind's style. */
export function drawTower(painter: EntityPainter, tower: Tower): void {
  const { shape, size, fill, outline, outlineWidth } = TOWER_STYLE[tower.kind];
  const half = size / 2;
  painter.fillStyle(fill);
  if (shape === 'circle') painter.fillCircle(0, 0, half);
  else painter.fillRect(-half, -half, size, size);
  painter.lineStyle(outlineWidth, outline);
  if (shape === 'circle') painter.strokeCircle(0, 0, half);
  else painter.strokeRect(-half, -half, size, size);
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
  const { shape, size } = TOWER_STYLE[kind];
  const half = size / 2;
  painter.fillStyle(color, GHOST.fillAlpha);
  if (shape === 'circle') painter.fillCircle(0, 0, half);
  else painter.fillRect(-half, -half, size, size);
  painter.lineStyle(GHOST.ringWidth, color, GHOST.ringAlpha);
  for (const radius of rangeRingRadii(TOWER_STATS[kind])) painter.strokeCircle(0, 0, radius);
}

/** Each tracer as a line in canvas pixels, at its current alpha. */
export function drawTracers(painter: EntityPainter, tracers: readonly TracerLine[]): void {
  for (const { from, to, alpha } of tracers) {
    painter.lineStyle(TRACER.width, TRACER.color, alpha);
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
