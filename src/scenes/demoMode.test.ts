import { describe, expect, it } from 'vitest';
import { DEMO_SCENE_KEY, demoMode, showDemo, stopDemo } from './demoMode';

const PLAYER = { test: false, demo: false };
const DESKTOP = { reducedMotion: false, coarsePointer: false };

describe('demoMode', () => {
  it('plays in full for a player on a desktop', () => {
    expect(demoMode(PLAYER, DESKTOP)).toBe('full');
  });

  it('plays lighter on a phone (a coarse pointer)', () => {
    expect(demoMode(PLAYER, { ...DESKTOP, coarsePointer: true })).toBe('lite');
  });

  it('holds a still frame with reduced motion, phone or not', () => {
    expect(demoMode(PLAYER, { ...DESKTOP, reducedMotion: true })).toBe('still');
    expect(demoMode(PLAYER, { reducedMotion: true, coarsePointer: true })).toBe('still');
  });

  it('is off in test mode, so e2e see a flat background', () => {
    expect(demoMode({ test: true, demo: false }, DESKTOP)).toBe('off');
  });

  it('plays in test mode with ?demo=1', () => {
    expect(demoMode({ test: true, demo: true }, DESKTOP)).toBe('full');
    expect(demoMode({ test: true, demo: true }, { ...DESKTOP, reducedMotion: true })).toBe('still');
  });
});

describe('showDemo and stopDemo', () => {
  const fakeScenes = (registered: boolean, active: boolean) => {
    const calls: string[] = [];
    const scenes = {
      manager: { keys: registered ? { [DEMO_SCENE_KEY]: {} } : {} },
      isActive: (key: string) => key === DEMO_SCENE_KEY && active,
      launch: (key: string) => calls.push(`launch ${key}`),
      sendToBack: (key: string) => calls.push(`sendToBack ${key}`),
      stop: (key: string) => calls.push(`stop ${key}`),
    };
    return { scenes, calls };
  };

  it('launches the demo behind the menu when it is not running', () => {
    const { scenes, calls } = fakeScenes(true, false);
    showDemo(scenes);
    expect(calls).toEqual([`launch ${DEMO_SCENE_KEY}`, `sendToBack ${DEMO_SCENE_KEY}`]);
  });

  it('keeps a running demo playing, from the Main menu to the Level select and back', () => {
    const { scenes, calls } = fakeScenes(true, true);
    showDemo(scenes);
    expect(calls).toEqual([`sendToBack ${DEMO_SCENE_KEY}`]);
  });

  it('does nothing when the demo is off (no Demo scene)', () => {
    const { scenes, calls } = fakeScenes(false, false);
    showDemo(scenes);
    stopDemo(scenes);
    expect(calls).toEqual([]);
  });

  it('stops a running demo when a game starts', () => {
    const running = fakeScenes(true, true);
    stopDemo(running.scenes);
    expect(running.calls).toEqual([`stop ${DEMO_SCENE_KEY}`]);
    const idle = fakeScenes(true, false);
    stopDemo(idle.scenes);
    expect(idle.calls).toEqual([]);
  });
});
