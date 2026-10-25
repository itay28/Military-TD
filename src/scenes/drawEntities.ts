import { AIR_SHADOW, ENEMY_STYLE, GHOST, HP_BAR, RANGE_RING, TILE_PX, TOWER_STYLE, TRACER } from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
import type { MapPainter } from './drawMap';
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
  if (enemy.layer === 'air') {
    painter.fillStyle(AIR_SHADOW.color, AIR_SHADOW.alpha);
    painter.fillCircle(AIR_SHADOW.offsetX, AIR_SHADOW.offsetY, radius);
  }
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

/** A see-through tower of `kind` and its range ring, green if it can be placed here, red if not. */
export function drawGhost(painter: EntityPainter, kind: TowerKind, placeable: boolean): void {
  const color = placeable ? GHOST.placeable : GHOST.blocked;
  const { size } = TOWER_STYLE[kind];
  const half = size / 2;
  painter.fillStyle(color, GHOST.fillAlpha);
  painter.fillRect(-half, -half, size, size);
  painter.lineStyle(GHOST.ringWidth, color, GHOST.ringAlpha);
  painter.strokeCircle(0, 0, TOWER_STATS[kind].range * TILE_PX);
}

/** Each tracer as a line in canvas pixels, at its current alpha. */
export function drawTracers(painter: EntityPainter, tracers: readonly TracerLine[]): void {
  for (const { from, to, alpha } of tracers) {
    painter.lineStyle(TRACER.width, TRACER.color, alpha);
    painter.lineBetween(from.x, from.y, to.x, to.y);
  }
}
