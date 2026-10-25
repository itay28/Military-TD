/** Test mode's URL flags (ADR-0003). Each is inert unless set, and players never set them. */
export interface TestFlags {
  /** `?test=1`: exposes `window.__TD__`. */
  readonly test: boolean;
  /** `?step=manual`: the real-time loop stops; only `__TD__.step()` advances the game. */
  readonly manualStep: boolean;
  /** False with `?anim=0`: no cosmetic animation (tracers, floating texts). */
  readonly anim: boolean;
  /** `?speed=N`: the real-time loop runs N× faster. 1 unless N is a positive finite number. */
  readonly speed: number;
}

export function parseTestFlags(search: string): TestFlags {
  const params = new URLSearchParams(search);
  const speed = Number(params.get('speed') ?? '');
  return {
    test: params.get('test') === '1',
    manualStep: params.get('step') === 'manual',
    anim: params.get('anim') !== '0',
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
  };
}

/** The real time a frame of `deltaMs` feeds the fixed step: none with manual stepping, scaled by speed otherwise. */
export function frameMs({ manualStep, speed }: TestFlags, deltaMs: number): number {
  return manualStep ? 0 : deltaMs * speed;
}
