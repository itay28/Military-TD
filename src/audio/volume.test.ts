import { describe, expect, it, vi } from 'vitest';
import { createSettings, DEFAULT_SETTINGS } from '../settings/settings';
import { createAudioMix, effectiveVolume, type VisibilityDoc } from './volume';

/** A document whose `hidden` the test flips, firing `visibilitychange` like a browser tab. */
function fakeDocument(startHidden = false) {
  const listeners = new Set<() => void>();
  let hidden = startHidden;
  const doc: VisibilityDoc & { setHidden(value: boolean): void; listenerCount(): number } = {
    get hidden() {
      return hidden;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    setHidden(value) {
      hidden = value;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
  return doc;
}

describe('effectiveVolume', () => {
  it('is master × channel, as 0–1', () => {
    const levels = { ...DEFAULT_SETTINGS, masterVolume: 80, musicVolume: 60, sfxVolume: 50 };
    expect(effectiveVolume(levels, 'music')).toBeCloseTo(0.48);
    expect(effectiveVolume(levels, 'sfx')).toBeCloseTo(0.4);
  });

  it('is full at 100/100 and silent when either is 0', () => {
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, masterVolume: 100, musicVolume: 100 }, 'music')).toBe(1);
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, masterVolume: 0 }, 'music')).toBe(0);
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, masterVolume: 0 }, 'sfx')).toBe(0);
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, sfxVolume: 0 }, 'sfx')).toBe(0);
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, sfxVolume: 0 }, 'music')).toBeGreaterThan(0);
  });
});

describe('createAudioMix', () => {
  it('follows the settings live', () => {
    const settings = createSettings();
    const mix = createAudioMix(settings, fakeDocument());
    expect(mix.volume('sfx')).toBeCloseTo(0.64);
    settings.set({ sfxVolume: 25 });
    expect(mix.volume('sfx')).toBeCloseTo(0.2);
  });

  it('is silent while the tab is hidden and comes back when it is visible again', () => {
    const doc = fakeDocument();
    const mix = createAudioMix(createSettings(), doc);
    doc.setHidden(true);
    expect(mix.volume('music')).toBe(0);
    expect(mix.volume('sfx')).toBe(0);
    doc.setHidden(false);
    expect(mix.volume('music')).toBeCloseTo(0.48);
  });

  it('starts silent in a tab that is already hidden', () => {
    expect(createAudioMix(createSettings(), fakeDocument(true)).volume('music')).toBe(0);
  });

  it('tells subscribers when the settings or the tab visibility change, until they unsubscribe', () => {
    const settings = createSettings();
    const doc = fakeDocument();
    const mix = createAudioMix(settings, doc);
    const listener = vi.fn();
    const unsubscribe = mix.subscribe(listener);
    settings.set({ musicVolume: 10 });
    doc.setHidden(true);
    doc.setHidden(false);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    settings.set({ musicVolume: 20 });
    doc.setHidden(true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('listens to the document once, however many subscribers there are', () => {
    const doc = fakeDocument();
    const mix = createAudioMix(createSettings(), doc);
    mix.subscribe(() => {});
    mix.subscribe(() => {});
    expect(doc.listenerCount()).toBe(1);
  });
});
