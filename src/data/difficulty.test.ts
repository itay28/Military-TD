import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY } from './difficulty';
import { START_LIVES, START_MONEY } from './start';

describe('DIFFICULTY', () => {
  it('has Normal and Hard, Normal first', () => {
    expect(DIFFICULTIES).toEqual(['normal', 'hard']);
    expect(DIFFICULTIES.map((d) => DIFFICULTY[d].label)).toEqual(['Normal', 'Hard']);
  });

  it('Normal changes nothing: ×1 HP and reward, the usual start Lives and Money', () => {
    expect(DIFFICULTY.normal).toMatchObject({
      hpScale: 1,
      rewardScale: 1,
      startLives: START_LIVES,
      startMoney: START_MONEY,
    });
  });

  it('Hard is harder on every count: tougher enemies, smaller rewards, fewer Lives and less Money', () => {
    const hard = DIFFICULTY.hard;
    expect(hard.hpScale).toBeGreaterThan(1);
    expect(hard.rewardScale).toBeLessThan(1);
    expect(hard.rewardScale).toBeGreaterThan(0);
    expect(hard.startLives).toBeLessThan(START_LIVES);
    expect(hard.startLives).toBeGreaterThan(0);
    expect(hard.startMoney).toBeLessThan(START_MONEY);
    expect(Number.isInteger(hard.startLives) && Number.isInteger(hard.startMoney)).toBe(true);
  });
});
