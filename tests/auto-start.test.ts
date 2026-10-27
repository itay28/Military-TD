import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  AUTO_AGENT_LABEL,
  DONE_MARKER,
  FIRED_MARKER,
  HANDOFF_MARKER,
  classifyFireError,
  commentNoSize,
  firedComment,
  NO_SIZE_MARKER,
  MAX_SIZE_REQUESTS,
  planRetries,
  planSizingRequests,
  planStarts,
  requestSizing,
  retryIssue,
  SIZE_REQUESTED_MARKER,
  sizingNeeds,
  retryText,
  stackBase,
  startIssue,
  type OpenPr,
  type RetryIssue,
  type Routines,
  type SizingCandidate,
  type StartIssue,
} from '../scripts/auto-start';
import { autoStartFromEnv, milestoneOrder } from '../scripts/board-sync';

// Auto-start: after reconciling, Board sync claims startable issues and fires the implement task (#167).
const issue = (number: number, over: Partial<StartIssue> = {}): StartIssue => ({
  number,
  status: 'Ready',
  assigned: false,
  tracker: false,
  labelled: true,
  hold: false,
  needsYou: false,
  autoAgent: false,
  infra: false,
  size: 'S',
  priority: 'P1',
  milestone: 2,
  blockedBy: [],
  ...over,
});
const pr = (head: string, base: string, issues: number[]): OpenPr => ({ head, base, issues });
const order = [2, 3];
const numbers = (issues: readonly StartIssue[], prs: readonly OpenPr[] = [], options = {}) =>
  planStarts(issues, prs, order, options).starts.map((s) => s.issue);

describe('planStarts: which issues are startable', () => {
  it('starts Ready, unassigned issues sized XS to L', () => {
    const sizes = ['XS', 'S', 'M', 'L'].map((size, i) => issue(i + 1, { size }));
    expect(numbers(sizes)).toEqual([1, 2, 3, 4]);
  });

  it('skips assigned, held, XL, tracker, unlabelled and blocked issues', () => {
    expect(
      numbers([
        issue(1, { assigned: true }),
        issue(2, { hold: true }),
        issue(3, { size: 'XL' }),
        issue(4, { tracker: true }),
        issue(5, { labelled: false }),
        issue(6, { blockedBy: [99] }),
      ]),
    ).toEqual([]);
  });

  it('skips an issue handed to the maintainer with needs-you (#200)', () => {
    expect(numbers([issue(1, { needsYou: true }), issue(2)])).toEqual([2]);
  });

  it('skips issues that already have an open PR, and cards already in progress or review', () => {
    expect(
      numbers(
        [issue(1), issue(2, { status: 'In progress' }), issue(3, { status: 'In review' })],
        [pr('feat/1', 'main', [1])],
      ),
    ).toEqual([]);
  });

  it('lists issues without a Size for the one-time comment instead of starting them', () => {
    const plan = planStarts([issue(1, { size: undefined }), issue(2)], [], order);
    expect(plan.starts.map((s) => s.issue)).toEqual([2]);
    expect(plan.noSize).toEqual([1]);
  });

  it('picks the model by Size: XS/S Sonnet, M/L Opus', () => {
    const plan = planStarts(
      ['XS', 'S', 'M', 'L'].map((size, i) => issue(i + 1, { size })),
      [],
      order,
    );
    expect(plan.starts.map((s) => s.model)).toEqual(['sonnet', 'sonnet', 'opus', 'opus']);
  });

  it('bases unblocked issues on the default branch', () => {
    expect(planStarts([issue(1)], [], order, { defaultBranch: 'trunk' }).starts[0]?.base).toBe('trunk');
  });
});

describe('planStarts: order and cap', () => {
  it('orders by Priority (P0 first, none last), then issue number', () => {
    expect(
      numbers([
        issue(5, { priority: 'P2' }),
        issue(4, { priority: undefined }),
        issue(3, { priority: 'P0' }),
        issue(2, { priority: 'P2' }),
        issue(1, { priority: 'P1' }),
      ]),
    ).toEqual([3, 1, 2, 5, 4]);
  });

  it('starts at most 5 at once, counting auto-agent issues already in progress', () => {
    const waiting = [10, 11, 12, 13, 14, 15].map((n) => issue(n));
    expect(numbers(waiting)).toEqual([10, 11, 12, 13, 14]);
    const running = [1, 2, 3].map((n) => issue(n, { status: 'In progress', assigned: true, autoAgent: true }));
    expect(numbers([...running, ...waiting])).toEqual([10, 11]);
    expect(numbers([...running, ...waiting], [], { cap: 3 })).toEqual([]);
  });

  it('does not count in-progress issues a person picked up', () => {
    const person = [1, 2, 3, 4, 5].map((n) => issue(n, { status: 'In progress', assigned: true }));
    expect(numbers([...person, issue(10)])).toEqual([10]);
  });
});

describe('planStarts: look-ahead', () => {
  it('uses the next milestone when the current one has nothing startable', () => {
    const next = issue(7, { milestone: 3, status: 'Backlog' });
    expect(numbers([issue(1, { milestone: 2, assigned: true }), next])).toEqual([7]);
  });

  it('stays on the current milestone when it has something to start', () => {
    expect(numbers([issue(1), issue(7, { milestone: 3, status: 'Backlog' })])).toEqual([1]);
  });

  it('looks only one milestone ahead, and never at issues without one', () => {
    expect(
      numbers([issue(7, { milestone: 4, status: 'Backlog' }), issue(8, { milestone: null, status: 'Backlog' })]),
    ).toEqual([]);
  });
});

// Infra work isn't tied to a game version, so it needs no milestone (#225).
describe('planStarts: infra issues without a milestone', () => {
  const infra = (number: number, over: Partial<StartIssue> = {}) =>
    issue(number, { infra: true, milestone: null, ...over });

  it('starts alongside the current milestone when it has work', () => {
    expect(numbers([issue(1), infra(2)])).toEqual([1, 2]);
  });

  it('starts when the current milestone has nothing, and the look-ahead still runs', () => {
    expect(numbers([infra(2)])).toEqual([2]);
    expect(numbers([infra(2), issue(7, { milestone: 3, status: 'Backlog' })])).toEqual([2, 7]);
  });

  it('starts when no milestone is open', () => {
    expect(planStarts([infra(2)], [], []).starts.map((s) => s.issue)).toEqual([2]);
  });

  it('never starts game work without a milestone', () => {
    expect(numbers([issue(1, { milestone: null }), issue(2, { milestone: null, status: 'Backlog' })])).toEqual([]);
  });

  it('orders by Priority across infra and milestone issues', () => {
    expect(
      numbers([issue(1, { priority: 'P2' }), infra(2, { priority: 'P0' }), issue(3, { priority: 'P1' }), infra(4)]),
    ).toEqual([2, 3, 4, 1]);
  });

  it('keeps the cap', () => {
    const running = [1, 2, 3, 4].map((n) => issue(n, { status: 'In progress', assigned: true, autoAgent: true }));
    expect(numbers([...running, issue(10, { priority: 'P2' }), infra(11, { priority: 'P1' })])).toEqual([11]);
  });

  it('still needs a Size, blockers cleared and no hold or needs-you', () => {
    expect(planStarts([infra(2, { size: undefined })], [], order)).toEqual({ starts: [], noSize: [2] });
    expect(numbers([infra(2, { blockedBy: [9] }), infra(3, { hold: true }), infra(4, { needsYou: true })])).toEqual([]);
  });

  it('follows its milestone when it has one', () => {
    expect(numbers([infra(2, { milestone: 3, status: 'Backlog' }), issue(1)])).toEqual([1]);
  });
});

describe('stackBase: the stack-next rule', () => {
  it('is the default branch without open blockers', () => {
    expect(stackBase([], [], 'main')).toBe('main');
  });

  it('is the PR branch when the one blocker has an open PR', () => {
    expect(stackBase([5], [pr('feat/5-a', 'main', [5])], 'main')).toBe('feat/5-a');
  });

  it('is the tip when the blockers are closed by PRs on one chain', () => {
    const prs = [pr('feat/6-b', 'feat/5-a', [6]), pr('feat/5-a', 'main', [5])];
    expect(stackBase([5, 6], prs, 'main')).toBe('feat/6-b');
    expect(stackBase([6, 5], prs, 'main')).toBe('feat/6-b');
  });

  it('allows other PRs between the blockers on the chain', () => {
    const prs = [pr('feat/7-c', 'feat/6-b', [7]), pr('feat/6-b', 'feat/5-a', [6]), pr('feat/5-a', 'main', [5])];
    expect(stackBase([5, 7], prs, 'main')).toBe('feat/7-c');
  });

  it('is null when a blocker has no open PR', () => {
    expect(stackBase([5, 6], [pr('feat/5-a', 'main', [5])], 'main')).toBeNull();
  });

  it('is null when the blockers sit on two branches of the stack', () => {
    const prs = [pr('feat/5-a', 'main', [5]), pr('feat/6-b', 'main', [6])];
    expect(stackBase([5, 6], prs, 'main')).toBeNull();
  });

  it('is null when the chain does not reach the default branch', () => {
    expect(stackBase([5], [pr('feat/5-a', 'someone-elses-branch', [5])], 'main')).toBeNull();
    expect(stackBase([5], [pr('a', 'b', [5]), pr('b', 'a', [])], 'main')).toBeNull();
  });
});

describe('planStarts: stacking', () => {
  const blocked = issue(9, { blockedBy: [5], status: 'Backlog' });
  const prs = [pr('feat/5-a', 'main', [5])];

  it('starts a stackable issue on its parent PR branch when AUTO_STACK is on', () => {
    expect(planStarts([blocked], prs, order, { stack: true }).starts).toEqual([
      { issue: 9, base: 'feat/5-a', model: 'sonnet' },
    ]);
  });

  it('leaves it alone when AUTO_STACK is off', () => {
    expect(numbers([blocked], prs)).toEqual([]);
  });
});

describe('milestoneOrder', () => {
  const m = (number: number, title: string, dueOn: string | null = null) => ({ number, title, dueOn });

  it('lists dated milestones by due date, then the rest by version', () => {
    expect(
      milestoneOrder([m(9, 'v0.10.0'), m(4, 'v0.3.0', '2026-12-01'), m(8, 'v0.9.0'), m(6, 'v0.5.0', '2026-11-01')]),
    ).toEqual([6, 4, 8, 9]);
  });
});

const routines: Routines = {
  sonnet: { url: 'https://fire.example/sonnet', token: 'sonnet-token' },
  opus: { url: 'https://fire.example/opus', token: 'opus-token' },
};
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });
const calls = (fetchFn: Mock<Fetch>) => fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url}`);

describe('startIssue: claim, then fire', () => {
  const start = { issue: 12, base: 'feat/5-a', model: 'opus' as const };
  const api = 'https://api.github.com/repos/itay28/Military-TD/issues/12';

  it('assigns the maintainer and adds auto-agent before firing the routine for its model', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await startIssue(start, 'gh-token', routines, fetchFn);
    expect(calls(fetchFn).slice(0, 3)).toEqual([
      `POST ${api}/assignees`,
      `POST ${api}/labels`,
      'POST https://fire.example/opus',
    ]);
    const [, assign] = fetchFn.mock.calls[0]!;
    expect(JSON.parse(assign.body as string)).toEqual({ assignees: ['itay28'] });
    const [, label] = fetchFn.mock.calls[1]!;
    expect(JSON.parse(label.body as string)).toEqual({ labels: [AUTO_AGENT_LABEL] });
  });

  it('sends the issue number and base branch as the fire text, with the routine token', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await startIssue(start, 'gh-token', routines, fetchFn);
    const [, fire] = fetchFn.mock.calls[2]!;
    const headers = fire.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer opus-token');
    expect(headers['anthropic-beta']).toMatch(/^experimental-cc-routine-/);
    const { text } = JSON.parse(fire.body as string) as { text: string };
    expect(text).toContain('Issue: #12');
    expect(text).toContain('Base branch: feat/5-a');
  });

  it('reports a start that went through', async () => {
    await expect(
      startIssue(
        start,
        'gh-token',
        routines,
        vi.fn<Fetch>(async () => ok()),
      ),
    ).resolves.toBe('started');
  });

  it.each([429, 500, 503])(
    'un-claims quietly and leaves it for the next run when the fire is refused with HTTP %i (#200)',
    async (status) => {
      const fetchFn = vi.fn<Fetch>(async (url: string) =>
        url.startsWith('https://fire.example') ? new Response('busy', { status }) : ok(),
      );
      await expect(startIssue(start, 'gh-token', routines, fetchFn)).resolves.toBe('later');
      expect(calls(fetchFn)).toEqual([
        `POST ${api}/assignees`,
        `POST ${api}/labels`,
        'POST https://fire.example/opus',
        `DELETE ${api}/assignees`,
        `DELETE ${api}/labels/${AUTO_AGENT_LABEL}`,
      ]);
    },
  );

  it('throws when un-claiming fails after a temporary refusal, so the stuck claim shows', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string, init: RequestInit) =>
      url.startsWith('https://fire.example')
        ? new Response('busy', { status: 429 })
        : init.method === 'DELETE'
          ? new Response('gone', { status: 500 })
          : ok(),
    );
    await expect(startIssue(start, 'gh-token', routines, fetchFn)).rejects.toThrow(/un-claiming failed/);
  });

  it('un-claims, hands the issue to the maintainer and throws on a setup error (#200)', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.startsWith('https://fire.example') ? new Response('bad token', { status: 401 }) : ok(),
    );
    await expect(startIssue(start, 'gh-token', routines, fetchFn)).rejects.toThrow(/#12/);
    expect(calls(fetchFn)).toEqual([
      `POST ${api}/assignees`,
      `POST ${api}/labels`,
      'POST https://fire.example/opus',
      `DELETE ${api}/assignees`,
      `DELETE ${api}/labels/${AUTO_AGENT_LABEL}`,
      `POST ${api}/comments`,
      `POST ${api}/labels`,
    ]);
    const { body } = JSON.parse(fetchFn.mock.calls[5]![1].body as string) as { body: string };
    expect(body).toContain(HANDOFF_MARKER);
    expect(body).toContain('HTTP 401');
    expect(body).toContain('ROUTINE_OPUS_TOKEN');
    expect(JSON.parse(fetchFn.mock.calls[6]![1].body as string)).toEqual({ labels: ['needs-you'] });
  });

  it('does not fire when the claim fails', async () => {
    const fetchFn = vi.fn<Fetch>(async () => new Response('forbidden', { status: 403 }));
    await expect(startIssue(start, 'gh-token', routines, fetchFn)).rejects.toThrow();
    expect(calls(fetchFn).some((c) => c.includes('fire.example'))).toBe(false);
  });

  it('removes the assignee again when adding the label fails', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string, init: RequestInit) =>
      init.method === 'POST' && url.endsWith('/labels') ? new Response('nope', { status: 422 }) : ok(),
    );
    await expect(startIssue(start, 'gh-token', routines, fetchFn)).rejects.toThrow(/#12/);
    expect(calls(fetchFn)).toContain(`DELETE ${api}/assignees`);
    expect(calls(fetchFn).some((c) => c.includes('fire.example'))).toBe(false);
  });

  it('still reports the fire error when un-claiming fails too', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string, init: RequestInit) =>
      url.startsWith('https://fire.example')
        ? new Response('fire broke', { status: 400 })
        : init.method === 'DELETE'
          ? new Response('gone', { status: 500 })
          : ok(),
    );
    const failure = startIssue(start, 'gh-token', routines, fetchFn);
    await expect(failure).rejects.toThrow(/fire broke/);
    await expect(failure).rejects.toThrow(/un-claiming failed/);
  });
  it('posts the fired marker with the session link, model and base after a successful fire (#201)', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.startsWith('https://fire.example')
        ? ok({ claude_code_session_url: 'https://claude.ai/code/session_1' })
        : ok(),
    );
    await startIssue(start, 'gh-token', routines, fetchFn);
    expect(calls(fetchFn)[3]).toBe(`POST ${api}/comments`);
    const { body } = JSON.parse(fetchFn.mock.calls[3]![1].body as string) as { body: string };
    expect(body).toContain(FIRED_MARKER);
    expect(body).toContain('https://claude.ai/code/session_1');
    expect(body).toContain('model=opus base=feat/5-a');
  });

  it('still reports the start when posting the fired marker fails: the session is already running', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.endsWith('/comments') ? new Response('nope', { status: 500 }) : ok(),
    );
    await expect(startIssue(start, 'gh-token', routines, fetchFn)).resolves.toBe('started');
    expect(calls(fetchFn)).not.toContain(`DELETE ${api}/assignees`);
  });
});

describe('classifyFireError (#200)', () => {
  const refused = (status: number) => Object.assign(new Error(`fire: HTTP ${status}`), { status });

  it.each([429, 500, 502, 503, 529])('HTTP %i is temporary: retry on a later run', (status) => {
    expect(classifyFireError(refused(status))).toBe('temporary');
  });

  it('a network error with no status is temporary', () => {
    expect(classifyFireError(new TypeError('fetch failed'))).toBe('temporary');
  });

  it.each([400, 401, 403, 404, 422])('HTTP %i is a setup error', (status) => {
    expect(classifyFireError(refused(status))).toBe('setup');
  });
});

describe('commentNoSize', () => {
  const api = 'https://api.github.com/repos/itay28/Military-TD/issues/4/comments';

  it('comments once, with a marker', async () => {
    const fetchFn = vi.fn<Fetch>(async (_url: string, init: RequestInit) => (init.method === 'GET' ? ok([]) : ok()));
    expect(await commentNoSize(4, 'gh-token', fetchFn)).toBe(true);
    expect(calls(fetchFn)).toEqual([`GET ${api}?per_page=100`, `POST ${api}`]);
    const [, post] = fetchFn.mock.calls[1]!;
    expect((JSON.parse(post.body as string) as { body: string }).body).toContain(NO_SIZE_MARKER);
  });

  it('does not repeat the comment when the marker is already there', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok([{ body: `Needs a Size.\n${NO_SIZE_MARKER}` }]));
    expect(await commentNoSize(4, 'gh-token', fetchFn)).toBe(false);
    expect(calls(fetchFn)).toEqual([`GET ${api}?per_page=100`]);
  });
});

describe('sizingNeeds (#225)', () => {
  it('needs a Size with no board Size and no size label', () => {
    expect(sizingNeeds(['area:ui'], undefined, 2)).toEqual({ size: true, milestone: false });
    expect(sizingNeeds(['area:ui', 'size:S'], undefined, 2)).toEqual({ size: false, milestone: false });
    expect(sizingNeeds(['area:ui'], 'M', 2)).toEqual({ size: false, milestone: false });
  });

  it('needs a milestone for game work without one', () => {
    expect(sizingNeeds(['area:towers'], 'M', null)).toEqual({ size: false, milestone: true });
    expect(sizingNeeds([], undefined, null)).toEqual({ size: true, milestone: true });
  });

  it('needs nothing for a sized infra issue without a milestone', () => {
    expect(sizingNeeds(['area:infra'], 'S', null)).toEqual({ size: false, milestone: false });
    expect(sizingNeeds([], 'S', null, 'infra')).toEqual({ size: false, milestone: false });
  });
});

describe('planSizingRequests: the Board sync backfill (#225)', () => {
  const candidate = (number: number, over: Partial<SizingCandidate> = {}): SizingCandidate => ({
    number,
    labels: ['ready-for-agent', 'area:ui'],
    size: undefined,
    milestone: 2,
    tracker: false,
    ...over,
  });

  it('asks for unsized issues and game work without a milestone', () => {
    expect(planSizingRequests([candidate(1), candidate(2, { size: 'M', milestone: null })])).toEqual([1, 2]);
  });

  it('skips issues already sized and milestoned, and sized infra without a milestone', () => {
    expect(
      planSizingRequests([
        candidate(1, { size: 'M' }),
        candidate(2, { size: 'S', milestone: null, labels: ['ready-for-agent', 'area:infra'] }),
      ]),
    ).toEqual([]);
  });

  it('skips hold, needs-info, needs-you, trackers and issues not ready-for-agent', () => {
    expect(
      planSizingRequests([
        candidate(1, { labels: ['ready-for-agent', 'hold'] }),
        candidate(2, { labels: ['ready-for-agent', 'needs-info'] }),
        candidate(3, { labels: ['ready-for-agent', 'needs-you'] }),
        candidate(4, { tracker: true }),
        candidate(5, { labels: ['needs-triage'] }),
      ]),
    ).toEqual([]);
  });

  it('keeps a few dispatches per run', () => {
    expect(MAX_SIZE_REQUESTS).toBeGreaterThan(0);
    expect(MAX_SIZE_REQUESTS).toBeLessThanOrEqual(5);
  });
});

describe('requestSizing (#225)', () => {
  const issues = 'https://api.github.com/repos/itay28/Military-TD/issues/4/comments';
  const dispatch = 'https://api.github.com/repos/itay28/Military-TD/actions/workflows/size-issue.yml/dispatches';

  it('dispatches Size issue for the issue, then leaves the marker', async () => {
    const fetchFn = vi.fn<Fetch>(async (_url: string, init: RequestInit) => (init.method === 'GET' ? ok([]) : ok()));
    expect(await requestSizing(4, 'gh-token', 'main', fetchFn)).toBe(true);
    expect(calls(fetchFn)).toEqual([`GET ${issues}?per_page=100`, `POST ${dispatch}`, `POST ${issues}`]);
    expect(JSON.parse(fetchFn.mock.calls[1]![1].body as string)).toEqual({ ref: 'main', inputs: { issue: '4' } });
    expect((JSON.parse(fetchFn.mock.calls[2]![1].body as string) as { body: string }).body).toContain(
      SIZE_REQUESTED_MARKER,
    );
  });

  it('dispatches once per issue: not again when the marker is there', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok([{ body: `Sizing asked.\n${SIZE_REQUESTED_MARKER}` }]));
    expect(await requestSizing(4, 'gh-token', 'main', fetchFn)).toBe(false);
    expect(calls(fetchFn)).toEqual([`GET ${issues}?per_page=100`]);
  });

  it('leaves no marker when the dispatch fails, so the next run tries again', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string, init: RequestInit) =>
      init.method === 'GET' ? ok([]) : url.endsWith('dispatches') ? new Response('nope', { status: 500 }) : ok(),
    );
    await expect(requestSizing(4, 'gh-token', 'main', fetchFn)).rejects.toThrow(/HTTP 500/);
    expect(calls(fetchFn)).toEqual([`GET ${issues}?per_page=100`, `POST ${dispatch}`]);
  });
});

describe('autoStartFromEnv: the AUTO_SPAWN switch', () => {
  const secrets = {
    ROUTINE_SONNET_URL: 'https://fire.example/sonnet',
    ROUTINE_SONNET_TOKEN: 's',
    ROUTINE_OPUS_URL: 'https://fire.example/opus',
    ROUTINE_OPUS_TOKEN: 'o',
  };

  it('is off unless AUTO_SPAWN is on', () => {
    expect(autoStartFromEnv(secrets)).toBeUndefined();
    expect(autoStartFromEnv({ ...secrets, AUTO_SPAWN: 'off' })).toBeUndefined();
  });

  it('reads both routines, and stacking only with AUTO_STACK on', () => {
    expect(autoStartFromEnv({ ...secrets, AUTO_SPAWN: 'on' })).toEqual({
      stack: false,
      routines: {
        sonnet: { url: 'https://fire.example/sonnet', token: 's' },
        opus: { url: 'https://fire.example/opus', token: 'o' },
      },
    });
    expect(autoStartFromEnv({ ...secrets, AUTO_SPAWN: 'on', AUTO_STACK: 'on' })?.stack).toBe(true);
  });

  it('fails loudly when on without a routine secret', () => {
    expect(() => autoStartFromEnv({ ...secrets, AUTO_SPAWN: 'on', ROUTINE_OPUS_TOKEN: '' })).toThrow(
      /ROUTINE_OPUS_TOKEN/,
    );
  });
});

// Retries (#201): an implement session that ends without its done marker is fired again after 1 h of silence.
const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60 * 1000).toISOString();
const fired = (minutes: number, model = 'opus', base = 'main') => ({
  body: firedComment({ issue: 7, base, model: model as 'opus' | 'sonnet' }),
  createdAt: ago(minutes),
});
const done = (minutes: number) => ({ body: `PR ready.\n\n${DONE_MARKER}`, createdAt: ago(minutes) });
const said = (minutes: number) => ({ body: 'Tests red.', createdAt: ago(minutes) });
const claimed = (over: Partial<RetryIssue> = {}): RetryIssue => ({
  number: 7,
  autoAgent: true,
  hold: false,
  needsYou: false,
  needsInfo: false,
  comments: [fired(61)],
  ...over,
});
const retried = (issues: RetryIssue[]) => planRetries(issues, NOW).map((r) => r.issue);

describe('planRetries: which claimed issues are dead (#201)', () => {
  it('retries a fired issue with no done marker and no activity for 61 min', () => {
    expect(retried([claimed()])).toEqual([7]);
  });

  it('leaves it alone at 59 min of silence', () => {
    expect(retried([claimed({ comments: [fired(59)] })])).toEqual([]);
    expect(retried([claimed({ comments: [fired(120), said(59)] })])).toEqual([]);
  });

  it('leaves it alone when a done marker came after the latest fired marker', () => {
    expect(retried([claimed({ comments: [fired(180), done(120)] })])).toEqual([]);
  });

  it('retries when the latest fire came after a done marker', () => {
    expect(retried([claimed({ comments: [fired(300), done(240), fired(120)] })])).toEqual([7]);
  });

  it('never retries needs-info, needs-you, hold or an issue auto-start did not claim', () => {
    expect(retried([claimed({ needsInfo: true })])).toEqual([]);
    expect(retried([claimed({ needsYou: true })])).toEqual([]);
    expect(retried([claimed({ hold: true })])).toEqual([]);
    expect(retried([claimed({ autoAgent: false })])).toEqual([]);
  });

  it('never retries an issue with no fired marker (claimed before #201)', () => {
    expect(retried([claimed({ comments: [said(300)] })])).toEqual([]);
  });

  it('never retries an issue whose PR is ready: the steward owns it', () => {
    const pr = { number: 40, head: 'fix/7-a', draft: false, activity: [ago(300)] };
    expect(retried([claimed({ pr })])).toEqual([]);
  });

  it('counts a commit or comment on the draft PR as activity', () => {
    const pr = { number: 40, head: 'fix/7-a', draft: true, activity: [ago(30)] };
    expect(retried([claimed({ comments: [fired(300)], pr })])).toEqual([]);
  });

  it('fires the same model on the same base, carrying the draft PR branch and number', () => {
    const pr = { number: 40, head: 'fix/7-a', draft: true, activity: [ago(90)] };
    expect(planRetries([claimed({ comments: [fired(300, 'sonnet', 'feat/5-b')], pr })], NOW)).toEqual([
      { issue: 7, base: 'feat/5-b', model: 'sonnet', branch: 'fix/7-a', pr: 40 },
    ]);
    expect(planRetries([claimed()], NOW)).toEqual([{ issue: 7, base: 'main', model: 'opus' }]);
  });

  it('takes the idle time as an option', () => {
    expect(planRetries([claimed({ comments: [fired(30)] })], NOW, HOUR / 4).map((r) => r.issue)).toEqual([7]);
  });
});

describe('planRetries: unparseable timestamps (#201)', () => {
  it('does not retry an issue whose comment time fails to parse', () => {
    expect(retried([claimed({ comments: [{ ...fired(61), createdAt: 'not a date' }] })])).toEqual([]);
  });
});

describe('retryText (#201)', () => {
  it('adds Branch and PR lines only when they exist', () => {
    const plain = retryText({ issue: 7, base: 'main', model: 'opus' });
    expect(plain).toContain('Issue: #7');
    expect(plain).toContain('Base branch: main');
    expect(plain).not.toContain('Branch: ');
    expect(plain).not.toContain('PR:');
    const full = retryText({ issue: 7, base: 'main', model: 'opus', branch: 'fix/7-a', pr: 40 });
    expect(full).toContain('\nBranch: fix/7-a');
    expect(full).toContain('\nPR: #40');
  });
});

describe('retryIssue: fire again, keep the claim (#201)', () => {
  const retry = { issue: 7, base: 'main', model: 'sonnet' as const, branch: 'fix/7-a', pr: 40 };
  const api = 'https://api.github.com/repos/itay28/Military-TD/issues/7';

  it('fires the same model with the retry text, then posts a new fired marker, without touching the claim', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await expect(retryIssue(retry, 'gh-token', routines, fetchFn)).resolves.toBe('started');
    expect(calls(fetchFn)).toEqual(['POST https://fire.example/sonnet', `POST ${api}/comments`]);
    const { text } = JSON.parse(fetchFn.mock.calls[0]![1].body as string) as { text: string };
    expect(text).toContain('PR: #40');
    const { body } = JSON.parse(fetchFn.mock.calls[1]![1].body as string) as { body: string };
    expect(body).toContain(FIRED_MARKER);
  });

  it('still reports the retry as started when posting the fired marker fails', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.startsWith('https://fire.example') ? ok() : new Response('boom', { status: 500 }),
    );
    await expect(retryIssue(retry, 'gh-token', routines, fetchFn)).resolves.toBe('started');
  });

  it('leaves it for a later run on a temporary refusal, posting nothing', async () => {
    const fetchFn = vi.fn<Fetch>(async () => new Response('busy', { status: 429 }));
    await expect(retryIssue(retry, 'gh-token', routines, fetchFn)).resolves.toBe('later');
    expect(calls(fetchFn)).toEqual(['POST https://fire.example/sonnet']);
  });

  it('hands the issue to the maintainer and throws on a setup error', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.startsWith('https://fire.example') ? new Response('bad token', { status: 401 }) : ok(),
    );
    await expect(retryIssue(retry, 'gh-token', routines, fetchFn)).rejects.toThrow(/#7/);
    expect(calls(fetchFn)).toEqual(['POST https://fire.example/sonnet', `POST ${api}/comments`, `POST ${api}/labels`]);
    expect(JSON.parse(fetchFn.mock.calls[2]![1].body as string)).toEqual({ labels: ['needs-you'] });
  });
});
