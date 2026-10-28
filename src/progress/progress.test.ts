import { describe, expect, it } from 'vitest';
import { createProgress, EMPTY_PROGRESS } from './progress';

describe('createProgress', () => {
  it('starts empty', () => {
    expect(createProgress().get()).toEqual(EMPTY_PROGRESS);
  });

  it('records a win as completed with its stars', () => {
    const progress = createProgress();
    progress.recordResult('crossroads', 2);
    expect(progress.get().maps.crossroads).toEqual({ completed: true, bestStars: 2 });
  });

  it('raises bestStars on a better win', () => {
    const progress = createProgress();
    progress.recordResult('crossroads', 1);
    progress.recordResult('crossroads', 3);
    expect(progress.get().maps.crossroads?.bestStars).toBe(3);
  });

  it('never lowers bestStars on a worse later win', () => {
    const progress = createProgress();
    progress.recordResult('crossroads', 3);
    progress.recordResult('crossroads', 1);
    expect(progress.get().maps.crossroads).toEqual({ completed: true, bestStars: 3 });
  });

  it('keeps other maps untouched', () => {
    const progress = createProgress();
    progress.recordResult('a', 1);
    progress.recordResult('b', 2);
    expect(progress.get().maps).toEqual({
      a: { completed: true, bestStars: 1 },
      b: { completed: true, bestStars: 2 },
    });
  });

  it('rejects stars that are not 1 to 3', () => {
    const progress = createProgress();
    expect(() => progress.recordResult('a', 0 as never)).toThrow(RangeError);
    expect(() => progress.recordResult('a', 4 as never)).toThrow(RangeError);
  });
});
