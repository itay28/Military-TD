import { describe, expect, it } from 'vitest';
import { createSpawnSchedule } from './waves';

const WAVE = { kind: 'infantry', count: 3, spacingMs: 800 } as const;

describe('createSpawnSchedule', () => {
  it('the first spawn is due when the wave starts, then one every spacing', () => {
    const schedule = createSpawnSchedule(WAVE);
    expect(schedule.take(0)).toEqual([0]);
    expect(schedule.take(799)).toEqual([]);
    expect(schedule.take(800)).toEqual([800]);
    expect(schedule.take(1600)).toEqual([1600]);
  });

  it('each spawn is taken once, and the schedule ends after count spawns', () => {
    const schedule = createSpawnSchedule(WAVE);
    schedule.take(0);
    expect(schedule.take(0)).toEqual([]);
    expect(schedule.finished).toBe(false);
    expect(schedule.take(10_000)).toEqual([800, 1600]);
    expect(schedule.finished).toBe(true);
    expect(schedule.take(20_000)).toEqual([]);
  });

  it('a long step takes every spawn due in it, in order', () => {
    expect(createSpawnSchedule(WAVE).take(1700)).toEqual([0, 800, 1600]);
  });

  it('spacing 0 spawns the whole wave at once', () => {
    const schedule = createSpawnSchedule({ ...WAVE, spacingMs: 0 });
    expect(schedule.take(0)).toEqual([0, 0, 0]);
    expect(schedule.finished).toBe(true);
  });
});
