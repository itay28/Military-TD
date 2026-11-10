import { describe, expect, it, vi } from 'vitest';
import type { Fetch } from '../scripts/auto-start';
import { idleReasons } from '../scripts/pipeline-idle';
import {
  flagStale,
  planStaleClaims,
  readStale,
  STALE_MARKER,
  STALE_MS,
  staleQuery,
  type StaleIssue,
} from '../scripts/stale-claims';

// Board sync flags assigned issues nobody is working on (#489).
const now = Date.parse('2026-11-10T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;
const issue = (number: number, over: Partial<StaleIssue> = {}): StaleIssue => ({
  number,
  assigned: true,
  labels: ['enhancement'],
  tracker: false,
  milestone: 2,
  infra: false,
  hasPr: false,
  comments: [],
  activity: [ago(4 * DAY)],
  ...over,
});
const scope = [2, 3];

describe('planStaleClaims', () => {
  it('flags an assigned issue with no PR and 3 days of silence', () => {
    expect(planStaleClaims([issue(1)], scope, now)).toEqual([1]);
  });
  it('waits until the issue has been quiet for STALE_MS', () => {
    expect(STALE_MS).toBe(3 * DAY);
    expect(planStaleClaims([issue(1, { activity: [ago(3 * DAY - 1000)] })], scope, now)).toEqual([]);
    expect(planStaleClaims([issue(1, { activity: [ago(3 * DAY)] })], scope, now)).toEqual([1]);
  });
  it('counts a recent comment or branch commit as activity', () => {
    const recent = ago(DAY);
    expect(planStaleClaims([issue(1, { comments: [{ body: 'hi', createdAt: recent }] })], scope, now)).toEqual([]);
    expect(planStaleClaims([issue(1, { activity: [ago(5 * DAY), recent] })], scope, now)).toEqual([]);
  });
  it('skips an issue with an open PR', () => {
    expect(planStaleClaims([issue(1, { hasPr: true })], scope, now)).toEqual([]);
  });
  it('does not count auto-agent issues (the retry covers them), nor unassigned ones', () => {
    expect(planStaleClaims([issue(1, { labels: ['auto-agent'] })], scope, now)).toEqual([]);
    expect(planStaleClaims([issue(2, { assigned: false })], scope, now)).toEqual([]);
  });
  it('skips issues already waiting on the maintainer, held, or trackers', () => {
    for (const label of ['needs-you', 'needs-info', 'hold'])
      expect(planStaleClaims([issue(1, { labels: [label] })], scope, now)).toEqual([]);
    expect(planStaleClaims([issue(1, { tracker: true })], scope, now)).toEqual([]);
  });
  it('flags once: the marker comment stops later runs, even after needs-you is removed', () => {
    const flagged = [{ body: `Assigned...\n${STALE_MARKER}`, createdAt: ago(10 * DAY) }];
    expect(planStaleClaims([issue(1, { comments: flagged })], scope, now)).toEqual([]);
  });
  it('covers the current and next milestone, and infra without one', () => {
    const list = [
      issue(1, { milestone: 3 }),
      issue(2, { milestone: 9 }),
      issue(3, { milestone: null }),
      issue(4, { milestone: null, infra: true }),
    ];
    expect(planStaleClaims(list, scope, now)).toEqual([1, 4]);
  });
});

describe('staleQuery / readStale', () => {
  const data = {
    i0: {
      updatedAt: ago(5 * DAY),
      comments: { nodes: [{ body: 'plan', createdAt: ago(4 * DAY) }] },
      refs: {
        nodes: [
          { name: 'feat/7-thing', target: { committedDate: ago(2 * DAY) } },
          { name: 'feat/70-other', target: { committedDate: ago(DAY) } },
        ],
      },
    },
  };
  it('asks for each issue once, with its branches', () => {
    const query = staleQuery([7, 9]);
    expect(query).toContain('i0: issue(number: 7)');
    expect(query).toContain('i1: issue(number: 9)');
    expect(query).toContain('refs(refPrefix: "refs/heads/", query: "7-"');
  });
  it('reads the issue time, comments and the commits of its own branches only', () => {
    const { comments, activity } = readStale(data, 0, 7);
    expect(comments).toHaveLength(1);
    expect(activity).toEqual([data.i0.updatedAt, data.i0.refs.nodes[0]!.target.committedDate]);
  });
  it('reads a missing issue as no activity data', () => {
    expect(readStale({}, 0, 7)).toEqual({ comments: [], activity: [] });
  });
});

describe('flagStale', () => {
  const respond = (comments: { body: string }[]) =>
    vi.fn<Fetch>(async (_url, init) => {
      const method = init.method ?? 'GET';
      const body = method === 'GET' ? comments : {};
      return new Response(JSON.stringify(body), { status: 200 });
    });
  it('comments with the marker, then labels needs-you', async () => {
    const fetchFn = respond([]);
    expect(await flagStale(5, 'tok', fetchFn)).toBe(true);
    const calls = fetchFn.mock.calls.filter(([, init]) => init.method === 'POST');
    expect(calls[0]![0]).toContain('issues/5/comments');
    expect(String(calls[0]![1].body)).toContain(STALE_MARKER);
    expect(String(calls[0]![1].body)).toContain('Unassign to let auto-start take it');
    expect(calls[1]![0]).toContain('issues/5/labels');
    expect(String(calls[1]![1].body)).toContain('needs-you');
  });
  it('does nothing when the marker is already there', async () => {
    const fetchFn = respond([{ body: STALE_MARKER }]);
    expect(await flagStale(5, 'tok', fetchFn)).toBe(false);
    expect(fetchFn.mock.calls.every(([, init]) => (init.method ?? 'GET') === 'GET')).toBe(true);
  });
});

describe('pipeline idle', () => {
  it('lists a flagged issue under waiting on you', () => {
    const reasons = idleReasons(
      [
        {
          number: 5,
          labels: ['needs-you'],
          status: 'In progress',
          assigned: true,
          tracker: false,
          milestone: 2,
          size: 'S',
          blockedBy: [],
          infra: false,
        },
      ],
      [],
      [2, 3],
      new Map(),
      { defaultBranch: 'main', stack: false },
    );
    expect(reasons.some((r) => r.group === 'waiting' && r.text.startsWith('#5 '))).toBe(true);
  });
});
