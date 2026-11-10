import { describe, expect, it } from 'vitest';
import { didSweep, lastSweepStart, scheduleDue, scheduleLateness } from '../scripts/schedule-gate.ts';

// GitHub delivers only a fraction of hourly cron runs (#328), so the cron fires 3x an hour and
// a scheduled run sweeps only when no sweep started recently.
const MIN = 60_000;
const now = Date.parse('2026-11-05T12:00:00Z');
const ago = (min: number) => now - min * MIN;

describe('scheduleDue', () => {
  it('sweeps when no sweep ran before', () => {
    expect(scheduleDue(now, undefined, 20 * MIN)).toBe(true);
  });
  it('skips when a sweep started within the minimum gap', () => {
    expect(scheduleDue(now, ago(5), 20 * MIN)).toBe(false);
    expect(scheduleDue(now, ago(19), 20 * MIN)).toBe(false);
  });
  it('sweeps once the last sweep is at least the minimum gap old', () => {
    expect(scheduleDue(now, ago(20), 20 * MIN)).toBe(true);
    expect(scheduleDue(now, ago(200), 20 * MIN)).toBe(true);
  });
});

describe('scheduleLateness', () => {
  it('is undefined with no earlier scheduled run', () => {
    expect(scheduleLateness(now, undefined, 120 * MIN)).toBeUndefined();
  });
  it('is undefined while the last scheduled run is within the limit', () => {
    expect(scheduleLateness(now, ago(90), 120 * MIN)).toBeUndefined();
  });
  it('gives the hours since the last scheduled run once over the limit', () => {
    expect(scheduleLateness(now, ago(300), 120 * MIN)).toBe(5);
    expect(scheduleLateness(now, ago(135), 120 * MIN)).toBe(2.3);
  });
});

describe('lastSweepStart', () => {
  it('is undefined with no runs or no sweeping run', () => {
    expect(lastSweepStart([])).toBeUndefined();
    expect(lastSweepStart([{ startMs: ago(5), swept: false }])).toBeUndefined();
  });
  it('ignores gate-skipped runs, so a skipped :21 run cannot push the next sweep later', () => {
    const runs = [
      { startMs: ago(40), swept: true },
      { startMs: ago(19), swept: false },
    ];
    expect(lastSweepStart(runs)).toBe(ago(40));
    expect(scheduleDue(now, lastSweepStart(runs), 20 * MIN)).toBe(true);
  });
  it('takes the newest sweeping run', () => {
    expect(
      lastSweepStart([
        { startMs: ago(30), swept: true },
        { startMs: ago(10), swept: true },
      ]),
    ).toBe(ago(10));
  });
});

describe('didSweep', () => {
  it('is false when only the gate ran, or the sweep job was skipped', () => {
    expect(didSweep([{ name: 'debounce', conclusion: 'success' }])).toBe(false);
    expect(
      didSweep([
        { name: 'debounce', conclusion: 'success' },
        { name: 'sweep', conclusion: 'skipped' },
      ]),
    ).toBe(false);
  });
  it('is true when a sweep job ran or is still running', () => {
    expect(didSweep([{ name: 'sweep', conclusion: 'success' }])).toBe(true);
    expect(didSweep([{ name: 'sweep', conclusion: null }])).toBe(true);
  });
});
