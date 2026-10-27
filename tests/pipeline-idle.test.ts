import { describe, expect, it, vi } from 'vitest';
import { HANDOFF_MARKER, type Fetch } from '../scripts/auto-start';
import {
  applyIdle,
  findIdleIssue,
  IDLE_MARKER,
  idleBody,
  idleReasons,
  isStarved,
  planIdle,
  type IdleIssue,
  type IdlePr,
  type Reason,
} from '../scripts/pipeline-idle';

// Board sync warns when the pipeline is starved: nothing to start and no agent working (#226).
const issue = (number: number, over: Partial<IdleIssue> = {}): IdleIssue => ({
  number,
  labels: ['ready-for-agent'],
  status: 'Ready',
  assigned: false,
  tracker: false,
  milestone: 2,
  size: 'S',
  blockedBy: [],
  infra: false,
  ...over,
});
const pr = (number: number, issues: number[], over: Partial<IdlePr> = {}): IdlePr => ({
  number,
  head: `feat/${number}`,
  base: 'main',
  labels: [],
  issues,
  ...over,
});
const order = [2, 3, 4];
const titles = new Map([
  [2, 'v0.2.0 — Combat depth'],
  [3, 'v0.3.0 — Economy'],
  [4, 'v0.4.0 — Polish'],
]);
const reasons = (issues: IdleIssue[], prs: IdlePr[] = [], options: { stack?: boolean; exclude?: number } = {}) =>
  idleReasons(issues, prs, order, titles, { defaultBranch: 'main', stack: false, ...options });
const keys = (rs: Reason[]) => rs.map((r) => r.key);
const texts = (rs: Reason[], group: Reason['group']) => rs.filter((r) => r.group === group).map((r) => r.text);

describe('isStarved', () => {
  it('is starved when nothing was planned and no auto-agent issue is In progress', () => {
    expect(
      isStarved(
        [
          { autoAgent: true, status: 'In review' },
          { autoAgent: false, status: 'In progress' },
        ],
        0,
      ),
    ).toBe(true);
  });

  it('is not starved while an auto-agent issue is In progress', () => {
    expect(isStarved([{ autoAgent: true, status: 'In progress' }], 0)).toBe(false);
  });

  it('is not starved when the run planned a start or a retry', () => {
    expect(isStarved([], 1)).toBe(false);
  });
});

describe('idleReasons: waiting on you', () => {
  it('lists issues and PRs labelled needs-you or needs-info', () => {
    const rs = reasons(
      [issue(5, { labels: ['needs-info'], milestone: 4 }), issue(6, { labels: ['needs-you'], milestone: null })],
      [pr(213, [7], { labels: ['needs-you'] })],
    );
    expect(keys(rs.filter((r) => r.group === 'waiting'))).toEqual(['waiting:#5', 'waiting:#6', 'waiting:PR#213']);
    expect(texts(rs, 'waiting').join('\n')).toContain('PR #213');
  });

  it('lists ready-for-human issues in the current milestone only', () => {
    const rs = reasons([
      issue(8, { labels: ['ready-for-human'], milestone: 2 }),
      issue(9, { labels: ['ready-for-human'], milestone: 3 }),
    ]);
    expect(keys(rs.filter((r) => r.group === 'waiting'))).toEqual(['waiting:#8']);
  });

  it('leaves out the idle issue itself', () => {
    expect(reasons([issue(99, { labels: ['needs-you'], milestone: null })], [], { exclude: 99 })).not.toContainEqual(
      expect.objectContaining({ key: 'waiting:#99' }),
    );
  });
});

describe('idleReasons: needs triage', () => {
  it('counts needs-triage issues in the current and next milestone', () => {
    const rs = reasons([
      issue(10, { labels: ['needs-triage'], milestone: 2 }),
      issue(11, { labels: ['needs-triage'], milestone: 3 }),
      issue(12, { labels: ['needs-triage'], milestone: 3 }),
      issue(13, { labels: ['needs-triage'], milestone: 4 }),
    ]);
    expect(keys(rs.filter((r) => r.group === 'triage'))).toEqual(['triage:2', 'triage:3']);
    expect(texts(rs, 'triage')).toEqual([
      '1 `needs-triage` issue in v0.2.0 — Combat depth',
      '2 `needs-triage` issues in v0.3.0 — Economy',
    ]);
  });
});

describe('idleReasons: not startable', () => {
  it('names a ready-for-agent issue with no Size, an XL Size, or game work with no milestone', () => {
    const rs = reasons([
      issue(20, { size: undefined }),
      issue(21, { size: 'XL', milestone: 3 }),
      issue(22, { milestone: null }),
    ]);
    expect(keys(rs.filter((r) => r.group === 'not-startable'))).toEqual(['no-size:#20', 'xl:#21', 'no-milestone:#22']);
  });

  it('says which blockers have a PR', () => {
    const rs = reasons([issue(30, { blockedBy: [31, 32] })], [pr(40, [31])]);
    expect(texts(rs, 'not-startable')).toEqual(['#30: blocked by #31 (PR #40), #32 (no PR)']);
  });

  it('says AUTO_STACK is off when the issue would have stacked', () => {
    const blocked = [issue(30, { blockedBy: [31] })];
    const prs = [pr(40, [31])];
    expect(texts(reasons(blocked, prs), 'not-startable')[0]).toContain(
      '`AUTO_STACK` is off: it would stack on `feat/40`',
    );
    expect(texts(reasons(blocked, prs, { stack: true }), 'not-startable')[0]).not.toContain('AUTO_STACK');
  });

  it('ignores issues that are claimed, have a PR, are trackers, on hold, or outside the current and next milestone', () => {
    const rs = reasons(
      [
        issue(50, { size: undefined, assigned: true }),
        issue(51, { size: undefined }),
        issue(52, { size: undefined, tracker: true }),
        issue(53, { size: undefined, labels: ['ready-for-agent', 'hold'] }),
        issue(54, { size: undefined, milestone: 4 }),
      ],
      [pr(60, [51])],
    );
    expect(rs.filter((r) => r.group === 'not-startable')).toEqual([]);
  });

  it('accepts infra with no milestone', () => {
    expect(reasons([issue(23, { infra: true, milestone: null })])).toEqual([]);
  });
});

describe('idleReasons: nothing left', () => {
  it('says so when neither the current nor the next milestone has an open ready-for-agent issue', () => {
    const rs = reasons([issue(70, { milestone: 4 })]);
    expect(rs).toEqual([
      {
        group: 'nothing-left',
        key: 'nothing-left',
        text: 'v0.2.0 — Combat depth and v0.3.0 — Economy have no open `ready-for-agent` issues',
      },
    ]);
  });

  it('counts claimed ready-for-agent issues as work left', () => {
    expect(reasons([issue(71, { assigned: true, status: 'In review' })])).toEqual([]);
  });
});

describe('idleBody', () => {
  it('groups the reasons and carries the marker and the reason keys', () => {
    const body = idleBody(
      [
        { group: 'waiting', key: 'waiting:#5', text: '#5 `needs-info`' },
        { group: 'not-startable', key: 'no-size:#20', text: '#20: no Size' },
      ],
      '2026-10-27T11:00:00Z',
    );
    expect(body).toContain('**Waiting on you**\n- #5 `needs-info`');
    expect(body).toContain('**Not startable**\n- #20: no Size');
    expect(body).not.toContain('Needs triage');
    expect(body).toContain('2026-10-27T11:00:00Z');
    expect(body).toContain(IDLE_MARKER);
    expect(body).toContain('<!-- pipeline-starved:reasons no-size:#20 waiting:#5 -->');
  });
});

describe('planIdle', () => {
  const rs: Reason[] = [{ group: 'waiting', key: 'waiting:#5', text: '#5 `needs-info`' }];
  const open = { number: 99, body: idleBody(rs, '2026-10-27T10:00:00Z') };

  it('opens the idle issue on the first starved run', () => {
    expect(planIdle(true, [], null, rs)).toEqual({ action: 'open' });
  });

  it('updates the open issue without a push while the reasons stay the same', () => {
    expect(planIdle(true, [], open, rs)).toEqual({ action: 'update', issue: 99, push: false });
  });

  it('pushes again when the reasons change', () => {
    const changed: Reason[] = [...rs, { group: 'triage', key: 'triage:2', text: '1 issue' }];
    expect(planIdle(true, [], open, changed)).toEqual({ action: 'update', issue: 99, push: true });
  });

  it('closes the open issue when the run started an agent', () => {
    expect(planIdle(false, [12], open, [])).toEqual({ action: 'close', issue: 99, started: [12] });
  });

  it('does nothing when not starved and nothing started, or nothing is open to close', () => {
    expect(planIdle(false, [], open, [])).toBeNull();
    expect(planIdle(false, [12], null, [])).toBeNull();
  });
});

const api = 'https://api.github.com/repos/itay28/Military-TD';
const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });
const calls = (fetchFn: ReturnType<typeof vi.fn<Fetch>>) =>
  fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url}`);
const sent = (fetchFn: ReturnType<typeof vi.fn<Fetch>>, i: number) =>
  JSON.parse(fetchFn.mock.calls[i]![1].body as string) as Record<string, unknown>;

describe('findIdleIssue', () => {
  it('finds the open issue carrying the marker, skipping PRs', async () => {
    const fetchFn = vi.fn<Fetch>(async () =>
      ok([
        { number: 3, body: IDLE_MARKER, pull_request: {} },
        { number: 4, body: 'other' },
        { number: 5, body: `x\n${IDLE_MARKER}` },
      ]),
    );
    await expect(findIdleIssue('t', fetchFn)).resolves.toEqual({ number: 5, body: `x\n${IDLE_MARKER}` });
    expect(calls(fetchFn)).toEqual([`GET ${api}/issues?state=open&labels=area:infra&per_page=100`]);
  });

  it('returns null without one', async () => {
    await expect(
      findIdleIssue(
        't',
        vi.fn<Fetch>(async () => ok([])),
      ),
    ).resolves.toBeNull();
  });
});

describe('applyIdle', () => {
  const rs: Reason[] = [{ group: 'waiting', key: 'waiting:#5', text: '#5 `needs-info`' }];
  const now = '2026-10-27T11:00:00Z';

  it('opens the issue, posts the summary for the push, then labels it needs-you', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok({ number: 99, id: 1234 }));
    await applyIdle({ action: 'open' }, rs, now, 't', fetchFn);
    expect(calls(fetchFn)).toEqual([
      `POST ${api}/issues`,
      `POST ${api}/issues/24/sub_issues`,
      `POST ${api}/issues/99/comments`,
      `POST ${api}/issues/99/labels`,
    ]);
    expect(sent(fetchFn, 0)).toMatchObject({ title: 'Pipeline is idle', body: idleBody(rs, now) });
    expect(sent(fetchFn, 1)).toEqual({ sub_issue_id: 1234 });
    expect(String(sent(fetchFn, 2)['body'])).toMatch(new RegExp(`^${HANDOFF_MARKER}\n`));
    expect(sent(fetchFn, 3)).toEqual({ labels: ['needs-you', 'area:infra'] });
  });

  it('updates the body alone when there is nothing new to push', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await applyIdle({ action: 'update', issue: 99, push: false }, rs, now, 't', fetchFn);
    expect(calls(fetchFn)).toEqual([`PATCH ${api}/issues/99`]);
    expect(sent(fetchFn, 0)).toEqual({ body: idleBody(rs, now) });
  });

  it('comments and labels needs-you again when the reasons changed', async () => {
    const fetchFn = vi.fn<Fetch>(async (_url, init) =>
      init.method === 'DELETE' ? new Response('not found', { status: 404 }) : ok(),
    );
    await applyIdle({ action: 'update', issue: 99, push: true }, rs, now, 't', fetchFn);
    expect(calls(fetchFn)).toEqual([
      `PATCH ${api}/issues/99`,
      `POST ${api}/issues/99/comments`,
      `DELETE ${api}/issues/99/labels/needs-you`,
      `POST ${api}/issues/99/labels`,
    ]);
    expect(String(sent(fetchFn, 1)['body'])).toContain('#5 `needs-info`');
  });

  it('closes the issue with a comment and drops needs-you when an agent started', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await applyIdle({ action: 'close', issue: 99, started: [12] }, [], now, 't', fetchFn);
    expect(calls(fetchFn)).toEqual([
      `POST ${api}/issues/99/comments`,
      `DELETE ${api}/issues/99/labels/needs-you`,
      `PATCH ${api}/issues/99`,
    ]);
    expect(String(sent(fetchFn, 0)['body'])).toContain('#12');
    expect(sent(fetchFn, 2)).toEqual({ state: 'closed', state_reason: 'completed' });
  });
});
