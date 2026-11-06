// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyDisplaySettings } from './display';
import { createSettings } from './settings';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('html');
});

describe('applyDisplaySettings', () => {
  it('sets the text scale and the reduced-motion flag from the settings at once', () => {
    applyDisplaySettings(createSettings(), root);
    expect(root.style.getPropertyValue('--text-scale')).toBe('1');
    expect(root.hasAttribute('data-reduced-motion')).toBe(false);
  });

  it.each([
    [125, '1.25'],
    [150, '1.5'],
  ] as const)('scales text to %s %% as --text-scale %s', (textSize, scale) => {
    const settings = createSettings();
    applyDisplaySettings(settings, root);
    settings.set({ textSize });
    expect(root.style.getPropertyValue('--text-scale')).toBe(scale);
  });

  it('marks the page while reduced motion is on, and unmarks it when it goes off', () => {
    const settings = createSettings();
    applyDisplaySettings(settings, root);
    settings.set({ reducedMotion: true });
    expect(root.hasAttribute('data-reduced-motion')).toBe(true);
    settings.set({ reducedMotion: false });
    expect(root.hasAttribute('data-reduced-motion')).toBe(false);
  });

  it('stops following the settings once unsubscribed', () => {
    const settings = createSettings();
    const stop = applyDisplaySettings(settings, root);
    stop();
    settings.set({ textSize: 150 });
    expect(root.style.getPropertyValue('--text-scale')).toBe('1');
  });
});

describe('prefersReducedMotion', () => {
  it('reads the media query, and is false where matchMedia is missing', async () => {
    const { prefersReducedMotion } = await import('./display');
    expect(
      prefersReducedMotion({ matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) }),
    ).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});
