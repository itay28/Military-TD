import {
  AIR_SHADOW,
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
} from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
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

/** A circle or square in its kind's color (air kinds get an offset shadow, rotor kinds an X), with an HP bar above it filled in proportion to HP left. */
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

  const left = -HP_BAR.width / 2;
  const top = -radius - HP_BAR.gap - HP_BAR.height;
  painter.fillStyle(HP_BAR.back, HP_BAR.backAlpha);
  painter.fillRect(left, top, HP_BAR.width, HP_BAR.height);
  painter.fillStyle(HP_BAR.fill);
  painter.fillRect(left, top, (HP_BAR.width * enemy.hp) / enemy.maxHp, HP_BAR.height);
}

/** A filled square with an outline, in its kind's style, and a level pip per upgrade along its bottom edge. */
export function drawTower(painter: EntityPainter, tower: Tower): void {
  const { size, fill, outline, outlineWidth } = TOWER_STYLE[tower.kind];
  const half = size / 2;
  painter.fillStyle(fill);
  painter.fillRect(-half, -half, size, size);
  painter.lineStyle(outlineWidth, outline);
  painter.strokeRect(-half, -half, size, size);
  if (tower.level <= 1) return;
  const top = half - LEVEL_PIP.inset - LEVEL_PIP.size;
  painter.fillStyle(LEVEL_PIP.color);
  for (let i = 0; i < tower.level - 1; i++) {
    const left = -half + LEVEL_PIP.inset + i * (LEVEL_PIP.size + LEVEL_PIP.gap);
    painter.fillRect(left, top, LEVEL_PIP.size, LEVEL_PIP.size);
  }
}

/** The ring around a dismantling tower; `left` is the share of the dismantle time still to go (1 down to 0). */
export function drawDismantleRing(painter: EntityPainter, left: number): void {
  painter.lineStyle(DISMANTLE.width, DISMANTLE.color);
  painter.strokeCircle(0, 0, DISMANTLE.radius * left);
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
