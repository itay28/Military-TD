import { describe, expect, it } from 'vitest';
import { sizingNeeds } from '../scripts/auto-start';

// The sizing agent only sizes issues nobody sized, or game work with no milestone (#205, #225).
describe('sizingNeeds as the sizing agent sees it', () => {
  const needed = (...args: Parameters<typeof sizingNeeds>) => {
    const n = sizingNeeds(...args);
    return n.size || n.milestone;
  };

  it('is true with no Size on the board and no size label', () => {
    expect(needed(['ready-for-agent', 'priority:P1'], undefined, 2)).toBe(true);
  });

  it('is false when the board has a Size', () => {
    expect(needed(['ready-for-agent'], 'M', 2)).toBe(false);
  });

  it('is false when a size label is waiting for Board sync', () => {
    expect(needed(['ready-for-agent', 'size:S'], undefined, 2)).toBe(false);
  });

  it('is true for game work without a milestone, even when sized (#225)', () => {
    expect(needed(['ready-for-agent', 'area:units'], 'M', null)).toBe(true);
  });

  it('is false for a sized infra issue without a milestone (#225)', () => {
    expect(needed(['ready-for-agent', 'area:infra'], 'S', null)).toBe(false);
  });
});
