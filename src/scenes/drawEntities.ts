import { ENEMY_STYLE, HP_BAR, RANGE_RING, TILE_PX, TOWER_STYLE, TRACER } from '../data/display';
import type { Enemy } from '../sim/enemies';
import type { Tile } from '../sim/map';
import type { Tower } from '../sim/towers';
import type { TracerLine } from './tracers';

/** The part of Phaser's Graphics that the entity drawers use, so tests can pass a recording fake. */
export interface EntityPainter {
  fillStyle(color: number, alpha?: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

// Enemies, towers and range rings are drawn around the local origin; the scene positions each one's Graphics.

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

/** A filled square with an outline, in its kind's style. */
export function drawTower(painter: EntityPainter, tower: Tower): void {
  const { size, fill, outline, outlineWidth } = TOWER_STYLE[tower.kind];
  const half = size / 2;
  painter.fillStyle(fill);
  painter.fillRect(-half, -half, size, size);
  painter.lineStyle(outlineWidth, outline);
  painter.strokeRect(-half, -half, size, size);
}

/** The circle a tower can hit within. */
export function drawRangeRing(painter: EntityPainter, tower: Tower): void {
  painter.lineStyle(RANGE_RING.width, RANGE_RING.color, RANGE_RING.alpha);
  painter.strokeCircle(0, 0, tower.range * TILE_PX);
}

/** Each tracer as a line in canvas pixels, at its current alpha. */
export function drawTracers(painter: EntityPainter, tracers: readonly TracerLine[]): void {
  for (const { from, to, alpha } of tracers) {
    painter.lineStyle(TRACER.width, TRACER.color, alpha);
    painter.lineBetween(from.x, from.y, to.x, to.y);
  }
}

/** The tower standing on `tile`, if any, for the hover range ring. */
export function towerAt(towers: readonly Tower[], { col, row }: Tile): Tower | undefined {
  return towers.find((tower) => tower.tile.col === col && tower.tile.row === row);
}
