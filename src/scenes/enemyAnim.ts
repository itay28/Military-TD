import { ENEMY_ANIM } from '../data/display';

/** The movement animation frame enemy `id` shows `elapsedMs` of real time in: 0 up to `ENEMY_ANIM.frames` − 1. */
export function animFrame(elapsedMs: number, id: number): number {
  const { frameMs, frames, phaseMs } = ENEMY_ANIM;
  return Math.floor((elapsedMs + id * phaseMs) / frameMs) % frames;
}

/** A ground enemy's sprite scale on `frame`: the bob. */
export function bobScale(frame: number): number {
  return ENEMY_ANIM.bob[frame] ?? 1;
}

/** The Helicopter's rotor angle on `frame`: even steps over a quarter turn, so the X spins without a jump. */
export function rotorAngle(frame: number): number {
  return (frame * Math.PI) / 2 / ENEMY_ANIM.frames;
}
