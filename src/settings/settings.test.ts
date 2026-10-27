import { describe, expect, it } from 'vitest';
import { createSettings, DEFAULT_SETTINGS } from './settings';

describe('createSettings', () => {
  it('starts at the defaults: ×1 and only the selected or hovered tower’s range', () => {
    expect(DEFAULT_SETTINGS).toEqual({ defaultSpeed: 1, showAllRanges: false });
    expect(createSettings().get()).toEqual(DEFAULT_SETTINGS);
  });

  it('starts at the values it is given', () => {
    expect(createSettings({ defaultSpeed: 4, showAllRanges: true }).get()).toEqual({
      defaultSpeed: 4,
      showAllRanges: true,
    });
  });

  it('merges a change into the current settings', () => {
    const settings = createSettings();
    settings.set({ defaultSpeed: 2 });
    settings.set({ showAllRanges: true });
    expect(settings.get()).toEqual({ defaultSpeed: 2, showAllRanges: true });
  });

  it('rejects a default speed that is not ×1, ×2 or ×4', () => {
    const settings = createSettings();
    expect(() => settings.set({ defaultSpeed: 3 as never })).toThrow(RangeError);
    expect(settings.get().defaultSpeed).toBe(1);
  });

  it('hands out snapshots, so a caller cannot change the settings by mutating one', () => {
    const settings = createSettings();
    const before = settings.get();
    settings.set({ showAllRanges: true });
    expect(before.showAllRanges).toBe(false);
  });
});
