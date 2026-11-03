import { describe, expect, it } from 'vitest';
import { createWhistleTracker } from './whistle';

const shell = (id: number, landsAtMs: number) => ({ id, landsAtMs, target: { x: id, y: 0 } });

describe('createWhistleTracker', () => {
  it('whistles once for a shell inside the lead time before it lands', () => {
    const whistles = createWhistleTracker(500);
    const shells = [shell(1, 2000)];
    expect(whistles.due(shells, 1400)).toEqual([]);
    expect(whistles.due(shells, 1500)).toEqual([shells[0]]);
    expect(whistles.due(shells, 1600)).toEqual([]);
  });

  it('whistles at once for a shell that flies for less than the lead time', () => {
    const whistles = createWhistleTracker(500);
    expect(whistles.due([shell(2, 300)], 0).map((s) => s.id)).toEqual([2]);
  });

  it('keeps each shell apart and forgets the ones that have landed', () => {
    const whistles = createWhistleTracker(500);
    expect(whistles.due([shell(1, 1000), shell(2, 3000)], 600).map((s) => s.id)).toEqual([1]);
    expect(whistles.due([shell(2, 3000)], 2600).map((s) => s.id)).toEqual([2]);
    expect(whistles.tracked()).toBe(1);
    expect(whistles.due([], 3100)).toEqual([]);
    expect(whistles.tracked()).toBe(0);
  });
});
