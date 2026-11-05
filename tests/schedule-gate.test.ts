import { describe, expect, it } from 'vitest';
import { scheduleDue, scheduleLateness } from '../scripts/schedule-gate.ts';

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
