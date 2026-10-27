import { describe, expect, it } from 'vitest';
import { needsSizing } from '../scripts/size-issue';

// The sizing agent only sizes issues nobody sized (#205).
describe('needsSizing', () => {
  it('is true with no Size on the board and no size label', () => {
    expect(needsSizing(['ready-for-agent', 'priority:P1'], undefined, 2)).toBe(true);
  });

  it('is false when the board has a Size', () => {
    expect(needsSizing(['ready-for-agent'], 'M', 2)).toBe(false);
  });

  it('is false when a size label is waiting for Board sync', () => {
    expect(needsSizing(['ready-for-agent', 'size:S'], undefined, 2)).toBe(false);
  });

  it('is true for game work without a milestone, even when sized (#225)', () => {
    expect(needsSizing(['ready-for-agent', 'area:units'], 'M', null)).toBe(true);
  });

  it('is false for a sized infra issue without a milestone (#225)', () => {
    expect(needsSizing(['ready-for-agent', 'area:infra'], 'S', null)).toBe(false);
  });
});
