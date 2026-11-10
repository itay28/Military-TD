import { describe, expect, it, vi, type Mock } from 'vitest';
import { NEEDS_YOU_LABEL, SPLIT_LABEL, type Fetch } from '../scripts/auto-start';
import {
  giveUpSplit,
  labelledAt,
  MAX_SPLIT_ATTEMPTS,
  MAX_SPLIT_RETRIES,
  planSplitRetries,
  readSplitIssues,
  retrySplit,
  splitRunIssue,
  splitRunsByIssue,
  type SplitIssue,
  type SplitRun,
} from '../scripts/split-retry';

// A failed split must not hold an agent slot forever (#486): Board sync retries the split, then hands it over.
const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-11-10T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const run = (over: Partial<SplitRun> = {}): SplitRun => ({
  status: 'completed',
  conclusion: 'failure',
  createdAt: ago(2 * HOUR),
  url: 'https://github.com/itay28/Military-TD/actions/runs/1',
  ...over,
});
const split = (number: number, over: Partial<SplitIssue> = {}): SplitIssue => ({
  number,
  hold: false,
  needsYou: false,
  labelledAt: ago(3 * HOUR),
  runs: [],
  ...over,
});
const plan = (issues: SplitIssue[]) => planSplitRetries(issues, now);

describe('planSplitRetries: retry due (#486)', () => {
  it('retries a split whose one run failed more than 1 h ago', () => {
    expect(plan([split(79, { runs: [run()] })])).toEqual({ retry: [79], giveUp: [] });
  });

  it('retries when no run started at all and the label is more than 1 h old', () => {
    expect(plan([split(79)]).retry).toEqual([79]);
  });

  it('ignores skipped runs (another label) and runs from before the label went on', () => {
    const old = run({ createdAt: ago(5 * HOUR) });
    const skipped = run({ conclusion: 'skipped', createdAt: ago(2 * HOUR) });
    expect(plan([split(79, { runs: [old, old, skipped] })])).toEqual({ retry: [79], giveUp: [] });
  });

  it(`retries at most ${MAX_SPLIT_RETRIES} per run, lowest number first`, () => {
    expect(MAX_SPLIT_RETRIES).toBe(3);
    expect(plan([split(406), split(79), split(361), split(360)]).retry).toEqual([79, 360, 361]);
  });
});

describe('planSplitRetries: retry not yet due (#486)', () => {
  it('waits 1 h after the last attempt', () => {
    expect(plan([split(79, { runs: [run({ createdAt: ago(HOUR / 2) })] })]).retry).toEqual([]);
    expect(plan([split(79, { labelledAt: ago(HOUR / 2) })]).retry).toEqual([]);
  });

  it('leaves a split that is still running', () => {
    expect(plan([split(79, { runs: [run({ status: 'in_progress', conclusion: null })] })])).toEqual({
      retry: [],
      giveUp: [],
    });
  });

  it('leaves a split that succeeded', () => {
    expect(plan([split(79, { runs: [run(), run({ conclusion: 'success' })] })])).toEqual({ retry: [], giveUp: [] });
  });

  it('leaves held issues and ones already handed to the maintainer', () => {
    expect(plan([split(79, { hold: true }), split(80, { needsYou: true, runs: [run(), run()] })])).toEqual({
      retry: [],
      giveUp: [],
    });
  });
});

describe('planSplitRetries: give up (#486)', () => {
  it(`hands the issue over after ${MAX_SPLIT_ATTEMPTS} failed attempts, with their links`, () => {
    expect(MAX_SPLIT_ATTEMPTS).toBe(2);
    const runs = [run({ url: 'u1' }), run({ url: 'u2', conclusion: 'cancelled', createdAt: ago(HOUR / 4) })];
    expect(plan([split(79, { runs })])).toEqual({ retry: [], giveUp: [{ issue: 79, failed: ['u1', 'u2'] }] });
  });

  it('gives up on every such issue, whatever the retry cap', () => {
    const failed = { runs: [run(), run()] };
    expect(plan([split(1, failed), split(2, failed), split(3, failed), split(4, failed)]).giveUp).toHaveLength(4);
  });
});

describe('splitRunIssue: which issue a Split issue run is for', () => {
  it('reads the issue from the run name', () => {
    expect(splitRunIssue('Split issue #79')).toBe(79);
    expect(splitRunIssue('Split issue')).toBeUndefined();
    expect(splitRunIssue('Add a tower')).toBeUndefined();
  });

  it('groups the workflow runs by issue', () => {
    const runs = splitRunsByIssue([
      {
        display_title: 'Split issue #79',
        status: 'completed',
        conclusion: 'failure',
        created_at: 't1',
        html_url: 'u1',
      },
      {
        display_title: 'Some issue title',
        status: 'completed',
        conclusion: 'skipped',
        created_at: 't2',
        html_url: 'u2',
      },
    ]);
    expect(runs.get(79)).toEqual([{ status: 'completed', conclusion: 'failure', createdAt: 't1', url: 'u1' }]);
    expect(runs.size).toBe(1);
  });
});

describe('labelledAt: when needs-split went on', () => {
  it('is the latest needs-split labeled event', () => {
    const events = [
      { event: 'labeled', label: { name: SPLIT_LABEL }, created_at: 't1' },
      { event: 'labeled', label: { name: 'bug' }, created_at: 't2' },
      { event: 'unlabeled', label: { name: SPLIT_LABEL }, created_at: 't3' },
      { event: 'labeled', label: { name: SPLIT_LABEL }, created_at: 't4' },
      { event: 'commented', created_at: 't5' },
    ];
    expect(labelledAt(events)).toBe('t4');
    expect(labelledAt([])).toBeUndefined();
  });
});

const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });
const calls = (fetchFn: Mock<Fetch>) => fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url}`);
const api = 'https://api.github.com/repos/itay28/Military-TD';

describe('retrySplit (#486)', () => {
  it('dispatches Split issue for the issue', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    expect(await retrySplit(79, 'gh-token', 'main', fetchFn)).toBe('started');
    expect(calls(fetchFn)).toEqual([`POST ${api}/actions/workflows/split-issue.yml/dispatches`]);
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body as string)).toEqual({ ref: 'main', inputs: { issue: '79' } });
  });

  it('stays quiet on a temporary refusal (usage or rate limit): later', async () => {
    const fetchFn = vi.fn<Fetch>(async () => new Response('slow down', { status: 429 }));
    expect(await retrySplit(79, 'gh-token', 'main', fetchFn)).toBe('later');
    const down = vi.fn<Fetch>(async () => new Response('down', { status: 503 }));
    expect(await retrySplit(79, 'gh-token', 'main', down)).toBe('later');
  });

  it('throws on any other refusal', async () => {
    const fetchFn = vi.fn<Fetch>(async () => new Response('no', { status: 403 }));
    await expect(retrySplit(79, 'gh-token', 'main', fetchFn)).rejects.toThrow(/HTTP 403/);
  });
});

describe('giveUpSplit (#486)', () => {
  it('adds needs-you first, so a failed later call cannot post the comment twice', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    await giveUpSplit({ issue: 79, failed: ['u1', 'u2'] }, 'gh-token', fetchFn);
    expect(calls(fetchFn)).toEqual([
      `POST ${api}/issues/79/labels`,
      `POST ${api}/issues/79/comments`,
      `DELETE ${api}/issues/79/labels/${SPLIT_LABEL}`,
    ]);
    const body = (JSON.parse(fetchFn.mock.calls[1]![1].body as string) as { body: string }).body;
    expect(body).toContain('u1');
    expect(body).toContain('u2');
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body as string)).toEqual({ labels: [NEEDS_YOU_LABEL] });
  });
});

describe('readSplitIssues (#486)', () => {
  it('reads when each label went on, then the runs since the earliest', async () => {
    const fetchFn = vi.fn<Fetch>(async (url: string) =>
      url.includes('/events')
        ? ok([{ event: 'labeled', label: { name: SPLIT_LABEL }, created_at: url.includes('/79/') ? 't2' : 't1' }])
        : ok({
            workflow_runs: [
              {
                display_title: 'Split issue #79',
                status: 'completed',
                conclusion: 'failure',
                created_at: 't3',
                html_url: 'u',
              },
            ],
          }),
    );
    const read = await readSplitIssues(
      [
        { number: 79, hold: false, needsYou: false },
        { number: 80, hold: false, needsYou: false },
      ],
      'gh-token',
      fetchFn,
    );
    expect(calls(fetchFn)).toEqual([
      `GET ${api}/issues/79/events?per_page=100`,
      `GET ${api}/issues/80/events?per_page=100`,
      `GET ${api}/actions/workflows/split-issue.yml/runs?created=%3E%3Dt1&per_page=100&page=1`,
    ]);
    expect(read.map((i) => [i.number, i.labelledAt, i.runs.length])).toEqual([
      [79, 't2', 1],
      [80, 't1', 0],
    ]);
  });

  it('reads nothing without needs-split issues', async () => {
    const fetchFn = vi.fn<Fetch>(async () => ok());
    expect(await readSplitIssues([], 'gh-token', fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
