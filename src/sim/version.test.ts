import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from './version';

describe('sim', () => {
  it('exposes a version string', () => {
    expect(SIM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
