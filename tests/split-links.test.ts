import { describe, expect, it } from 'vitest';
import { failureComment, type LinkApi, linkParts, parsePlan, type SplitPlan } from '../scripts/split-links';

// The split agent writes split-plan.json; a plain workflow step links the parts (#488), so a
// denied agent command can no longer leave the parts unlinked.

/** An in-memory GitHub: issue ids are number * 1000, links are kept per issue. */
function fakeApi(opts: { sub?: Record<number, number[]>; blocked?: Record<number, number[]> } = {}) {
  const sub: Record<number, number[]> = structuredClone(opts.sub ?? {});
  const blocked: Record<number, number[]> = structuredClone(opts.blocked ?? {});
  const posts: string[] = [];
  const failing = new Set<string>();
  const dropped = new Set<string>();
  const api: LinkApi = {
    issueId: async (n) => n * 1000,
    subIssues: async (epic) => [...(sub[epic] ?? [])],
    blockedBy: async (n) => [...(blocked[n] ?? [])],
    addSubIssue: async (epic, id) => {
      const key = `sub ${epic} ${id / 1000}`;
      if (failing.has(key)) throw new Error('403 Resource not accessible');
      posts.push(key);
      if (!dropped.has(key)) (sub[epic] ??= []).push(id / 1000);
    },
    addBlockedBy: async (n, id) => {
      const key = `blocked ${n} ${id / 1000}`;
      if (failing.has(key)) throw new Error('403 Resource not accessible');
      posts.push(key);
      if (!dropped.has(key)) (blocked[n] ??= []).push(id / 1000);
    },
  };
  return { api, posts, failing, dropped, sub, blocked };
}

const plan: SplitPlan = { original: 441, epic: 24, parts: [442, 443, 444] };

describe('linkParts', () => {
  it('adds fresh parts under the epic and chains blocked-by in order', async () => {
    const gh = fakeApi();
    const result = await linkParts(plan, gh.api);
    expect(gh.posts).toEqual(['sub 24 442', 'sub 24 443', 'sub 24 444', 'blocked 443 442', 'blocked 444 443']);
    expect(result.problems).toEqual([]);
    expect(result.added).toHaveLength(5);
  });

  it('adds nothing when everything is already linked, so a re-run is safe', async () => {
    const gh = fakeApi({ sub: { 24: [100, 442, 443, 444] }, blocked: { 443: [442], 444: [443] } });
    const result = await linkParts(plan, gh.api);
    expect(gh.posts).toEqual([]);
    expect(result).toEqual({ added: [], problems: [] });
  });

  it('adds only the missing links', async () => {
    const gh = fakeApi({ sub: { 24: [442, 443] }, blocked: { 443: [442] } });
    const result = await linkParts(plan, gh.api);
    expect(gh.posts).toEqual(['sub 24 444', 'blocked 444 443']);
    expect(result.problems).toEqual([]);
  });

  it('reports a failed call for that part and still links the others', async () => {
    const gh = fakeApi();
    gh.failing.add('blocked 443 442');
    const result = await linkParts(plan, gh.api);
    expect(gh.posts).toEqual(['sub 24 442', 'sub 24 443', 'sub 24 444', 'blocked 444 443']);
    expect(result.problems).toEqual([{ issue: 443, message: expect.stringContaining('blocked by #442') as string }]);
    expect(result.problems[0]?.message).toContain('403');
  });

  it('reports a link that does not show up when read back', async () => {
    const gh = fakeApi();
    gh.dropped.add('sub 24 444');
    const result = await linkParts(plan, gh.api);
    expect(result.problems).toEqual([{ issue: 444, message: expect.stringContaining('not under #24') as string }]);
  });

  it('reports a part when its links cannot be read back', async () => {
    const gh = fakeApi();
    gh.api.blockedBy = async (n) => {
      if (n === 444) throw new Error('502 Bad Gateway');
      return [];
    };
    const result = await linkParts({ ...plan, epic: null }, gh.api);
    expect(result.problems.map((p) => p.issue)).toEqual([443, 444]);
  });

  it('only chains the parts when the original had no epic', async () => {
    const gh = fakeApi();
    const result = await linkParts({ ...plan, epic: null }, gh.api);
    expect(gh.posts).toEqual(['blocked 443 442', 'blocked 444 443']);
    expect(result.problems).toEqual([]);
  });
});

describe('parsePlan', () => {
  it('reads the plan the agent writes', () => {
    expect(parsePlan('{"original": 441, "epic": 24, "parts": [442, 443]}')).toEqual({
      original: 441,
      epic: 24,
      parts: [442, 443],
    });
    expect(parsePlan('{"original": 441, "epic": null, "parts": [442, 443]}').epic).toBeNull();
  });

  it.each([
    ['not json', 'nope'],
    ['no parts', '{"original": 441, "epic": 24}'],
    ['one part', '{"original": 441, "epic": 24, "parts": [442]}'],
    ['five parts', '{"original": 441, "epic": 24, "parts": [1, 2, 3, 4, 5]}'],
    ['a repeated part', '{"original": 441, "epic": 24, "parts": [442, 442]}'],
    ['the original as a part', '{"original": 441, "epic": 24, "parts": [441, 442]}'],
    ['a string part', '{"original": 441, "epic": 24, "parts": ["442", 443]}'],
    ['a bad epic', '{"original": 441, "epic": "24", "parts": [442, 443]}'],
    ['no original', '{"epic": 24, "parts": [442, 443]}'],
  ])('rejects %s', (_, text) => {
    expect(() => parsePlan(text)).toThrow();
  });
});

describe('failureComment', () => {
  it('names the problem, the run and what to do', () => {
    const body = failureComment(plan, { issue: 443, message: 'not blocked by #442' }, 'https://run');
    expect(body).toContain('not blocked by #442');
    expect(body).toContain('https://run');
    expect(body).toContain('#441');
    expect(body).toContain('_Generated by [Claude Code](https://claude.ai/code)_');
  });
});
