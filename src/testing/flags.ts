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
  /** `?menu=1`: test mode opens on the Main menu instead of going straight to the Game. */
  readonly menu: boolean;
  /** `?persist=1`: test mode saves settings to `localStorage` too (it uses memory otherwise, so runs don't leak). */
  readonly persist: boolean;
  /** `?unlock=all`: test mode opens every map on the Level select, so e2e can play any of them. */
  readonly unlockAll: boolean;
}

export function parseTestFlags(search: string): TestFlags {
  const params = new URLSearchParams(search);
  const speed = Number(params.get('speed') ?? '');
  return {
    test: params.get('test') === '1',
    manualStep: params.get('step') === 'manual',
    anim: params.get('anim') !== '0',
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    menu: params.get('menu') === '1',
    persist: params.get('persist') === '1',
    unlockAll: params.get('unlock') === 'all',
  };
}

/**
 * The time a frame of `deltaMs` feeds the fixed step: none with manual stepping, otherwise scaled by the `?speed`
 * flag and the player's game speed.
 */
export function frameMs({ manualStep, speed }: TestFlags, deltaMs: number, gameSpeed = 1): number {
  return manualStep ? 0 : deltaMs * speed * gameSpeed;
}

/** The scene Boot starts: the Main menu for a player; the Game in test mode, so specs start in the Build phase. */
export function firstScene({ test, menu }: TestFlags): 'Menu' | 'Game' {
  return test && !menu ? 'Game' : 'Menu';
}
