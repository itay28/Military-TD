import { describe, expect, it, vi } from 'vitest';
import {
  STUCK_MARKER,
  pushFor,
  questionMessage,
  releaseMessage,
  send,
  stewardSummary,
  stuckPrMessage,
} from '../scripts/notify';

const repoUrl = 'https://github.com/itay28/Military-TD';

describe('releaseMessage', () => {
  const push = releaseMessage('v0.2.0', repoUrl);

  it('names the version in its title', () => {
    expect(push.title).toBe('Military-TD v0.2.0 released');
  });

  it('clicks through to the GitHub Release', () => {
    expect(push.click).toBe(`${repoUrl}/releases/tag/v0.2.0`);
  });

  it('links the changelog at the tag', () => {
    expect(push.body).toContain(`${repoUrl}/blob/v0.2.0/CHANGELOG.md`);
  });
});

describe('stuckPrMessage', () => {
  const pr = { number: 180, title: 'feat: tank enemy', url: `${repoUrl}/pull/180` };

  it('clicks through to the PR and names it in the title', () => {
    const push = stuckPrMessage(pr, 'CI still red: e2e times out.');
    expect(push.title).toBe('PR #180 is stuck');
    expect(push.click).toBe(pr.url);
  });

  it("carries the steward's summary", () => {
    expect(stuckPrMessage(pr, 'CI still red: e2e times out.').body).toBe('CI still red: e2e times out.');
  });

  it('falls back to the PR title without a summary', () => {
    expect(stuckPrMessage(pr, null).body).toBe('feat: tank enemy');
  });

  it('cuts a long summary to fit an ntfy message', () => {
    const body = stuckPrMessage(pr, 'é'.repeat(5000)).body;
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(4000);
    expect(body.endsWith('…')).toBe(true);
  });
});

describe('questionMessage', () => {
  it('clicks through to the issue and carries its title', () => {
    const push = questionMessage({ number: 42, title: 'Sniper tower', url: `${repoUrl}/issues/42` });
    expect(push.title).toBe('Question on #42');
    expect(push.body).toBe('Sniper tower');
    expect(push.click).toBe(`${repoUrl}/issues/42`);
  });
});

describe('pushFor', () => {
  const names = (labels: string[]) => labels.map((name) => ({ name }));
  const onPr = (label: string, labels = [label]) => ({
    action: 'labeled',
    label: { name: label },
    pull_request: { number: 7, labels: names(labels) },
  });
  const onIssue = (label: string, labels = [label], extra: Record<string, unknown> = {}) => ({
    action: 'labeled',
    label: { name: label },
    issue: { number: 9, labels: names(labels), ...extra },
  });

  it('needs-you on a PR pushes for that PR', () => {
    expect(pushFor('pull_request', onPr('needs-you'))).toEqual({ kind: 'pr', number: 7 });
  });

  it('needs-info on an issue pushes for that issue', () => {
    expect(pushFor('issues', onIssue('needs-info'))).toEqual({ kind: 'issue', number: 9 });
  });

  it.each([
    ['another label on a PR', 'pull_request', onPr('bug')],
    ['another label on an issue', 'issues', onIssue('bug')],
    ['needs-info on a PR', 'pull_request', onPr('needs-info')],
    ['needs-you on an issue', 'issues', onIssue('needs-you')],
    ['an issues event for a PR', 'issues', onIssue('needs-info', ['needs-info'], { pull_request: {} })],
    ['a PR on hold', 'pull_request', onPr('needs-you', ['needs-you', 'hold'])],
    ['an issue on hold', 'issues', onIssue('needs-info', ['hold', 'needs-info'])],
    ['an unlabeled event', 'issues', { ...onIssue('needs-info'), action: 'unlabeled' }],
    ['another event', 'push', {}],
  ])('%s does not push', (_, name, event) => {
    expect(pushFor(name, event)).toBeNull();
  });
});

describe('stewardSummary', () => {
  const comment = (body: string) => ({ body });

  it('returns the latest marked comment without the marker', () => {
    const comments = [
      comment(`${STUCK_MARKER}\nOld summary.`),
      comment('A maintainer comment.'),
      comment(`${STUCK_MARKER}\nNew summary.\n`),
      comment('Later chatter.'),
    ];
    expect(stewardSummary(comments)).toBe('New summary.');
  });

  it('is null without a marked comment', () => {
    expect(stewardSummary([comment('Nothing here.')])).toBeNull();
  });
});

describe('send', () => {
  const push = { title: 'Military-TD v0.2.0 released', body: 'Changelog', click: `${repoUrl}/releases` };

  it('posts the body to the topic with title, click and tag headers', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 200 }));
    await send('secret-topic', push, fetch);
    expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/secret-topic', {
      method: 'POST',
      headers: { Title: push.title, Click: push.click, Tags: 'military-td' },
      body: push.body,
    });
  });

  it('fails without a topic', async () => {
    const fetch = vi.fn();
    await expect(send(undefined, push, fetch)).rejects.toThrow(/NTFY_TOPIC/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails when ntfy answers with an error', async () => {
    const fetch = vi.fn(async () => new Response('limit', { status: 429 }));
    await expect(send('secret-topic', push, fetch)).rejects.toThrow(/429/);
  });
});
