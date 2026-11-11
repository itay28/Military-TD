import { describe, expect, it } from 'vitest';
import { FRAME_P95_LIMIT_MS, frameStats, frameSummary } from './frameStats';

describe('frameStats', () => {
  it('gives the mean and the nearest-rank 95th percentile', () => {
    const deltas = Array.from({ length: 100 }, (_, i) => i + 1); // 1 … 100
    expect(frameStats(deltas)).toEqual({ frames: 100, meanMs: 50.5, p95Ms: 95 });
  });

  it('ignores the order of the frames', () => {
    expect(frameStats([30, 10, 20])).toEqual(frameStats([10, 20, 30]));
    expect(frameStats([30, 10, 20]).p95Ms).toBe(30);
  });

  it('throws without frames', () => {
    expect(() => frameStats([])).toThrow(RangeError);
  });
});

describe('frameSummary', () => {
  it('reports the mean, the p95 and the limit as Markdown, and whether it passed', () => {
    const passed = frameSummary({ frames: 240, meanMs: 16.71, p95Ms: 18.25 });
    expect(passed).toContain('16.7 ms');
    expect(passed).toContain('18.3 ms');
    expect(passed).toContain(`${FRAME_P95_LIMIT_MS} ms`);
    expect(passed).toContain('240');
    expect(passed).toMatch(/^### /);
    expect(passed).toContain('✅');
    expect(frameSummary({ frames: 240, meanMs: 30, p95Ms: 40 })).toContain('❌');
  });
});
