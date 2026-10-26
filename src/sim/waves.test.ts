import { describe, expect, it } from 'vitest';
import { createSpawnSchedule, validateWaves, type WaveData, type WaveGroup } from './waves';

const GROUP: WaveGroup = { kind: 'infantry', count: 3, spacingMs: 800, delayMs: 0 };
const WAVE: WaveData = { groups: [GROUP] };
const times = (spawns: readonly { atMs: number }[]) => spawns.map((s) => s.atMs);

describe('createSpawnSchedule', () => {
  it('the first spawn is due when the wave starts, then one every spacing', () => {
    const schedule = createSpawnSchedule(WAVE);
    expect(schedule.take(0)).toEqual([{ kind: 'infantry', atMs: 0, group: 0 }]);
    expect(schedule.take(799)).toEqual([]);
    expect(times(schedule.take(800))).toEqual([800]);
    expect(times(schedule.take(1600))).toEqual([1600]);
  });

  it('each spawn is taken once, and the schedule ends after count spawns', () => {
    const schedule = createSpawnSchedule(WAVE);
    schedule.take(0);
    expect(schedule.take(0)).toEqual([]);
    expect(schedule.finished).toBe(false);
    expect(times(schedule.take(10_000))).toEqual([800, 1600]);
    expect(schedule.finished).toBe(true);
    expect(schedule.take(20_000)).toEqual([]);
  });

  it('a long step takes every spawn due in it, in order', () => {
    expect(times(createSpawnSchedule(WAVE).take(1700))).toEqual([0, 800, 1600]);
  });

  it('spacing 0 spawns the whole group at once', () => {
    const schedule = createSpawnSchedule({ groups: [{ ...GROUP, spacingMs: 0 }] });
    expect(times(schedule.take(0))).toEqual([0, 0, 0]);
    expect(schedule.finished).toBe(true);
  });

  it('two groups spawn on their own timelines', () => {
    const schedule = createSpawnSchedule({
      groups: [
        { kind: 'infantry', count: 2, spacingMs: 1000, delayMs: 0 },
        { kind: 'infantry', count: 3, spacingMs: 300, delayMs: 0 },
      ],
    });
    expect(times(schedule.take(0))).toEqual([0, 0]);
    expect(times(schedule.take(600))).toEqual([300, 600]);
    expect(times(schedule.take(1000))).toEqual([1000]);
  });

  it("a group's delay holds back its first spawn", () => {
    const schedule = createSpawnSchedule({ groups: [{ ...GROUP, delayMs: 500 }] });
    expect(schedule.take(0)).toEqual([]);
    expect(schedule.take(499)).toEqual([]);
    expect(times(schedule.take(500))).toEqual([500]);
    expect(times(schedule.take(1300))).toEqual([1300]);
  });

  it('same-tick spawns come out in time order, then group order', () => {
    const schedule = createSpawnSchedule({
      groups: [
        { kind: 'infantry', count: 2, spacingMs: 400, delayMs: 200 },
        { kind: 'infantry', count: 1, spacingMs: 0, delayMs: 100 },
        { kind: 'infantry', count: 2, spacingMs: 600, delayMs: 0 },
      ],
    });
    // Due times: group 0 at 200, 600; group 1 at 100; group 2 at 0, 600.
    expect(schedule.take(1000).map(({ atMs, group }) => [atMs, group])).toEqual([
      [0, 2],
      [100, 1],
      [200, 0],
      [600, 0],
      [600, 2],
    ]);
  });

  it('finished only after every group', () => {
    const schedule = createSpawnSchedule({
      groups: [
        { kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 },
        { kind: 'infantry', count: 1, spacingMs: 0, delayMs: 2000 },
      ],
    });
    schedule.take(1000);
    expect(schedule.finished).toBe(false);
    schedule.take(2000);
    expect(schedule.finished).toBe(true);
  });
});

describe('validateWaves', () => {
  const ok: WaveData = { groups: [GROUP, GROUP] };

  it('accepts well-formed waves', () => {
    expect(() => validateWaves([ok, ok])).not.toThrow();
  });

  it('rejects a wave with no groups, naming the wave', () => {
    expect(() => validateWaves([ok, { groups: [] }])).toThrow(new RangeError('wave 2: has no groups'));
  });

  it.each([
    ['count 0', { count: 0 }, /^wave 2, group 2: count 0 /],
    ['a fractional count', { count: 2.5 }, /^wave 2, group 2: count 2\.5 /],
    ['a negative spacing', { spacingMs: -1 }, /^wave 2, group 2: spacing -1 ms /],
    ['an infinite spacing', { spacingMs: Number.POSITIVE_INFINITY }, /^wave 2, group 2: spacing Infinity ms /],
    ['a NaN spacing', { spacingMs: Number.NaN }, /^wave 2, group 2: spacing NaN ms /],
    ['a negative delay', { delayMs: -1 }, /^wave 2, group 2: delay -1 ms /],
    ['a NaN delay', { delayMs: Number.NaN }, /^wave 2, group 2: delay NaN ms /],
  ])('rejects a group with %s, naming wave and group', (_, bad, message) => {
    const waves = [ok, { groups: [GROUP, { ...GROUP, ...bad }] }];
    expect(() => validateWaves(waves)).toThrow(RangeError);
    expect(() => validateWaves(waves)).toThrow(message);
  });
});
