import { describe, expect, it, vi } from 'vitest';
import { createSettings, DEFAULT_SETTINGS, defaultSettings, TEXT_SIZES } from './settings';

describe('createSettings', () => {
  it('starts at the defaults: ×1, only the selected or hovered tower’s range, and 80/60/80 volumes', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      defaultSpeed: 1,
      showAllRanges: false,
      masterVolume: 80,
      musicVolume: 60,
      sfxVolume: 80,
      reducedMotion: false,
      textSize: 100,
    });
    expect(createSettings().get()).toEqual(DEFAULT_SETTINGS);
  });

  it('starts at the values it is given', () => {
    const given = {
      defaultSpeed: 3,
      showAllRanges: true,
      masterVolume: 10,
      musicVolume: 20,
      sfxVolume: 30,
      reducedMotion: true,
      textSize: 150,
    } as const;
    expect(createSettings(given).get()).toEqual(given);
  });

  it('merges a change into the current settings', () => {
    const settings = createSettings();
    settings.set({ defaultSpeed: 2 });
    settings.set({ showAllRanges: true });
    settings.set({ musicVolume: 0 });
    expect(settings.get()).toEqual({ ...DEFAULT_SETTINGS, defaultSpeed: 2, showAllRanges: true, musicVolume: 0 });
  });

  it('rejects a default speed that is not ×1, ×2 or ×3', () => {
    const settings = createSettings();
    expect(() => settings.set({ defaultSpeed: 4 as never })).toThrow(RangeError);
    expect(settings.get().defaultSpeed).toBe(1);
  });

  it.each([
    ['masterVolume', -1],
    ['musicVolume', 101],
    ['sfxVolume', 2.5],
    ['masterVolume', Number.NaN],
  ] as const)('rejects %s = %s: a volume is a whole number from 0 to 100', (field, value) => {
    const settings = createSettings();
    expect(() => settings.set({ [field]: value })).toThrow(RangeError);
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts the ends of the volume range', () => {
    const settings = createSettings();
    settings.set({ masterVolume: 0, sfxVolume: 100 });
    expect(settings.get()).toMatchObject({ masterVolume: 0, sfxVolume: 100 });
  });

  it('offers text sizes of 100, 125 and 150 %', () => {
    expect(TEXT_SIZES).toEqual([100, 125, 150]);
  });

  it.each([125, 150, 100] as const)('accepts a text size of %s %%', (textSize) => {
    const settings = createSettings();
    settings.set({ textSize });
    expect(settings.get().textSize).toBe(textSize);
  });

  it.each([110, 0, 200, Number.NaN])('rejects a text size of %s: only 100, 125 or 150', (textSize) => {
    const settings = createSettings();
    expect(() => settings.set({ textSize: textSize as never })).toThrow(RangeError);
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('switches reduced motion on and off', () => {
    const settings = createSettings();
    settings.set({ reducedMotion: true });
    expect(settings.get().reducedMotion).toBe(true);
    settings.set({ reducedMotion: false });
    expect(settings.get().reducedMotion).toBe(false);
  });

  it('hands out snapshots, so a caller cannot change the settings by mutating one', () => {
    const settings = createSettings();
    const before = settings.get();
    settings.set({ showAllRanges: true });
    expect(before.showAllRanges).toBe(false);
  });

  it('tells subscribers about each change, until they unsubscribe', () => {
    const settings = createSettings();
    const listener = vi.fn();
    const unsubscribe = settings.subscribe(listener);
    settings.set({ sfxVolume: 40 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    settings.set({ sfxVolume: 50 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not tell subscribers about a change it rejects', () => {
    const settings = createSettings();
    const listener = vi.fn();
    settings.subscribe(listener);
    expect(() => settings.set({ masterVolume: 200 })).toThrow(RangeError);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('defaultSettings', () => {
  it('turns reduced motion on by default when the system asks for less motion', () => {
    expect(defaultSettings({ prefersReducedMotion: true })).toEqual({ ...DEFAULT_SETTINGS, reducedMotion: true });
  });

  it('is DEFAULT_SETTINGS when the system has no preference', () => {
    expect(defaultSettings({ prefersReducedMotion: false })).toEqual(DEFAULT_SETTINGS);
  });
});
