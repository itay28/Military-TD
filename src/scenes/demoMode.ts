import type { TestFlags } from '../testing/flags';

/**
 * How the live battlefield behind the menu plays (#402): `full`; `lite` on a phone, with fewer effects; `still`, one
 * held frame, with reduced motion; `off` in test mode (a flat background, so e2e don't change) unless `?demo=1`.
 */
export type DemoMode = 'off' | 'still' | 'lite' | 'full';

/** What the device asks for: `prefers-reduced-motion: reduce`, and a coarse pointer (a phone or tablet). */
export interface DemoEnvironment {
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
}

export function demoMode({ test, demo }: Pick<TestFlags, 'test' | 'demo'>, env: DemoEnvironment): DemoMode {
  if (test && !demo) return 'off';
  if (env.reducedMotion) return 'still';
  return env.coarsePointer ? 'lite' : 'full';
}

/** The key of the Game scene instance that plays the demo; it is registered only when the demo isn't off. */
export const DEMO_SCENE_KEY = 'Demo';

/** The parts of Phaser's scene plugin the demo's lifecycle uses. */
export interface DemoScenes {
  readonly manager: { readonly keys: Readonly<Record<string, unknown>> };
  isActive(key: string): boolean;
  launch(key: string): unknown;
  sendToBack(key: string): unknown;
  stop(key: string): unknown;
}

const registered = (scenes: DemoScenes): boolean => DEMO_SCENE_KEY in scenes.manager.keys;

/** Runs the demo behind the calling scene (the Main menu or Level select), starting it if it isn't running yet. */
export function showDemo(scenes: DemoScenes): void {
  if (!registered(scenes)) return;
  if (!scenes.isActive(DEMO_SCENE_KEY)) scenes.launch(DEMO_SCENE_KEY);
  scenes.sendToBack(DEMO_SCENE_KEY);
}

/** Stops the demo, when a real game starts. */
export function stopDemo(scenes: DemoScenes): void {
  if (registered(scenes) && scenes.isActive(DEMO_SCENE_KEY)) scenes.stop(DEMO_SCENE_KEY);
}
