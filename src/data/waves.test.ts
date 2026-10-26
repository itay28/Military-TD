import { describe, expect, it } from 'vitest';
import { MVP_WAVES } from './waves';

describe('MVP waves', () => {
  it('the MVP schedule is one wave of 8 Infantry, 800 ms apart', () => {
    expect(MVP_WAVES).toEqual([{ groups: [{ kind: 'infantry', count: 8, spacingMs: 800, delayMs: 0 }] }]);
  });
});
