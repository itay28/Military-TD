import { describe, expect, it } from 'vitest';
import { type BlockApi, linkBlockers, parseBlockedMarker } from '../scripts/blocked-links';

// A missing dependency is a blocked-by link, not a needs-info question (#538). When the agent's own
// REST call is denied, it leaves a marker comment and a plain workflow step links the blockers.

function fakeApi(opts: { blocked?: number[]; failAdd?: number[]; dropAdd?: boolean } = {}) {
  const blocked = [...(opts.blocked ?? [])];
  const posts: number[] = [];
  const api: BlockApi = {
    issueId: async (n) => n * 1000,
    blockedBy: async () => [...blocked],
    addBlockedBy: async (_issue, id) => {
      const n = id / 1000;
      if (opts.failAdd?.includes(n)) throw new Error('403 Resource not accessible');
      posts.push(n);
      if (!opts.dropAdd) blocked.push(n);
    },
  };
  return { api, posts, blocked };
}

describe('parseBlockedMarker', () => {
  it('reads the issue numbers of one marker', () => {
    expect(parseBlockedMarker('Waits for renders.\n<!-- blocked-by: #459 #460 -->', 364)).toEqual([459, 460]);
  });
  it('returns nothing without a marker', () => {
    expect(parseBlockedMarker('just a comment about #459', 364)).toEqual([]);
  });
  it('drops duplicates, the issue itself and junk', () => {
    expect(parseBlockedMarker('<!-- blocked-by: #5 #5 #364 abc #0 #7 -->', 364)).toEqual([5, 7]);
  });
  it('merges several markers in order', () => {
    expect(parseBlockedMarker('<!-- blocked-by: #1 -->\n<!-- blocked-by: #2 #1 -->', 9)).toEqual([1, 2]);
  });
});

describe('linkBlockers', () => {
  it('adds the missing links and reads them back', async () => {
    const { api, posts } = fakeApi({ blocked: [459] });
    const result = await linkBlockers(364, [459, 460], api);
    expect(posts).toEqual([460]);
    expect(result).toEqual({ added: ['#364 blocked by #460'], problems: [] });
  });
  it('is idempotent', async () => {
    const { api, posts } = fakeApi({ blocked: [459, 460] });
    const result = await linkBlockers(364, [459, 460], api);
    expect(posts).toEqual([]);
    expect(result.added).toEqual([]);
  });
  it('reports a denied call instead of throwing, and still links the rest', async () => {
    const { api, blocked } = fakeApi({ failAdd: [459] });
    const result = await linkBlockers(364, [459, 460], api);
    expect(blocked).toEqual([460]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.message).toContain('#459');
  });
  it('catches a link that was accepted but never appeared', async () => {
    const { api } = fakeApi({ dropAdd: true });
    const result = await linkBlockers(364, [459], api);
    expect(result.problems[0]?.message).toContain('not blocked by #459');
  });
});
