import { describe, expect, it } from 'vitest';
import { debounceStep, type OtherRun } from '../scripts/debounce.ts';

// A burst of events ends in one sweep without a cancelled (red) run or a fixed wait (#417).
const run = (runNumber: number, gate: OtherRun['gate'] = 'passed', active = true): OtherRun => ({
  runNumber,
  active,
  gate,
});

describe('debounceStep', () => {
  it('goes at once when no other run is active', () => {
    expect(debounceStep(10, [])).toBe('go');
    expect(debounceStep(10, [run(9, 'passed', false), run(11, 'passed', false)])).toBe('go');
  });

  it('yields to a newer active run whose gate passed: that run sweeps after this event', () => {
    expect(debounceStep(10, [run(11)])).toBe('yield');
  });

  it("waits on a newer run whose gate isn't known yet: it may be a filtered event that never sweeps", () => {
    expect(debounceStep(10, [run(11, 'unknown')])).toBe('wait');
    expect(debounceStep(10, [run(11, 'unknown'), run(12)])).toBe('yield');
  });

  it('ignores a newer run whose gate was skipped (a filtered event that will never sweep)', () => {
    expect(debounceStep(10, [run(11, 'skipped')])).toBe('go');
  });

  it('waits while an older run is still active: sweeping, or about to yield', () => {
    expect(debounceStep(10, [run(9)])).toBe('wait');
  });

  it('yields rather than waits when both an older and a newer run are active', () => {
    expect(debounceStep(10, [run(9), run(12)])).toBe('yield');
  });
});
