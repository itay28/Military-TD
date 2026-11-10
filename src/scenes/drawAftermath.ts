import { AFTERMATH } from '../data/display';
import type { DecalView } from './aftermath';
import type { Pixel } from './coords';
import type { EntityPainter } from './drawEntities';

/** A painter that can also fill a polygon (Phaser's Graphics is one). */
export interface AftermathPainter extends EntityPainter {
  fillPoints(points: Pixel[], closeShape?: boolean): void;
}

/** The corners of a rectangle centered on `center`, `halfLength` along `heading` and `halfWidth` across it. */
export function rotatedRect(center: Pixel, halfLength: number, halfWidth: number, heading: number): Pixel[] {
  const ax = Math.cos(heading);
  const ay = Math.sin(heading);
  const corner = (along: number, across: number): Pixel => ({
    x: center.x + ax * along - ay * across,
    y: center.y + ay * along + ax * across,
  });
  return [
    corner(halfLength, halfWidth),
    corner(halfLength, -halfWidth),
    corner(-halfLength, -halfWidth),
    corner(-halfLength, halfWidth),
  ];
}

const offset = ({ x, y }: Pixel, angle: number, distance: number): Pixel => ({
  x: x + Math.cos(angle) * distance,
  y: y + Math.sin(angle) * distance,
});

/** A burnt-out hull on a scorch mark, turned the way the vehicle was heading. */
function drawWreck(painter: AftermathPainter, { at, heading, size, alpha }: DecalView): void {
  const { hull, scorch } = AFTERMATH;
  painter.fillStyle(scorch.color, scorch.alpha * alpha);
  painter.fillCircle(at.x, at.y, size * 1.3);
  painter.fillStyle(hull.color, hull.alpha * alpha);
  painter.fillPoints(rotatedRect(at, size * 1.1, size * 0.7, heading), true);
  painter.fillStyle(hull.turret, hull.alpha * alpha);
  painter.fillPoints(rotatedRect(at, size * 0.45, size * 0.35, heading + 0.3), true);
}

/** Where an aircraft came down: a wide scorch, a broken rotor and scattered debris. */
function drawCrashMark(painter: AftermathPainter, { at, heading, size, alpha }: DecalView): void {
  const { hull, scorch } = AFTERMATH;
  painter.fillStyle(scorch.color, scorch.alpha * alpha);
  painter.fillCircle(at.x, at.y, size * 1.5);
  painter.fillStyle(hull.color, hull.alpha * alpha);
  painter.fillPoints(rotatedRect(at, size * 0.8, size * 0.45, heading), true);
  painter.fillPoints(rotatedRect(offset(at, heading + Math.PI, size * 1.1), size * 0.5, size * 0.15, heading), true);
  painter.fillStyle(hull.turret, hull.alpha * alpha);
  for (let i = 0; i < 4; i++) {
    const angle = heading + 0.6 + (i * Math.PI) / 2;
    painter.fillPoints(rotatedRect(offset(at, angle, size * 1.2), size * 0.5, 1, angle + 1.2), true);
  }
}

/** A shell crater: scorched ground, a lighter rim and a dark pit. */
function drawCrater(painter: AftermathPainter, { at, alpha }: DecalView): void {
  const { crater, scorch } = AFTERMATH;
  painter.fillStyle(scorch.color, scorch.alpha * alpha);
  painter.fillCircle(at.x, at.y, crater.size * 2);
  painter.fillStyle(crater.rim, crater.alpha * alpha);
  painter.fillCircle(at.x, at.y, crater.size);
  painter.fillStyle(crater.color, crater.alpha * alpha);
  painter.fillCircle(at.x, at.y, crater.size * 0.65);
}

/** A soldier tipping over along the way they walked, lying flat once `fall` reaches 1. No blood. */
function drawFallen(painter: AftermathPainter, { at, heading, size, alpha, fall }: DecalView): void {
  const { fallen } = AFTERMATH;
  const halfLength = size * (0.35 + 0.65 * fall);
  painter.fillStyle(fallen.color, fallen.alpha * alpha);
  painter.fillPoints(rotatedRect(at, halfLength, size * 0.45, heading), true);
  const head = offset(at, heading, halfLength + size * 0.2);
  painter.fillStyle(fallen.head, fallen.alpha * alpha);
  painter.fillCircle(head.x, head.y, size * 0.35);
}

/** Flickering flames and smoke rising off a burning wreck, from how long it has burned (so the same age draws the same). */
function drawFire(painter: AftermathPainter, { at, size }: DecalView, fireMs: number): void {
  const { fire, smoke } = AFTERMATH;
  for (let i = 0; i < smoke.puffs; i++) {
    const phase = (fireMs / smoke.riseMs + i / smoke.puffs) % 1;
    painter.fillStyle(smoke.color, smoke.alpha * (1 - phase));
    painter.fillCircle(at.x + Math.sin(phase * 3 + i) * 3, at.y - size * 0.3 - phase * smoke.risePx, 3 + phase * 6);
  }
  for (let i = 0; i < fire.colors.length + 1; i++) {
    const flicker = 0.7 + 0.3 * Math.sin(fireMs / fire.flickerMs + i * 2.1);
    const spot = offset(at, i * 2.1, size * 0.35);
    painter.fillStyle(fire.colors[i % fire.colors.length]!, 0.9);
    painter.fillCircle(spot.x, spot.y, fire.radius * flicker);
  }
}

const DRAW = { wreck: drawWreck, crashMark: drawCrashMark, crater: drawCrater, fallen: drawFallen } as const;

/** Each decal, oldest first, with its fire over it while it burns. */
export function drawAftermath(painter: AftermathPainter, decals: readonly DecalView[]): void {
  for (const decal of decals) {
    DRAW[decal.kind](painter, decal);
    if (decal.fireMs !== undefined) drawFire(painter, decal, decal.fireMs);
  }
}
