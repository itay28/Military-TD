import { describe, expect, it, vi } from 'vitest';
import { currentEpic, fileUnderEpic, pickEpic, type EpicIssue, type Request } from '../scripts/epic.ts';

const epic = (number: number, over: Partial<EpicIssue> = {}): EpicIssue => ({
  number,
  title: 'Epic: Infra & testing',
  state: 'open',
  labels: [{ name: 'epic' }],
  sub_issues_summary: { total: 10 },
  ...over,
});

describe('pickEpic', () => {
  it('picks the open epic over a closed one with the same name', () => {
    expect(
      pickEpic([epic(24, { state: 'closed' }), epic(585, { title: 'Epic: Infra & testing (2)' })], 'infra')?.number,
    ).toBe(585);
  });
  it('picks the newest of two open epics', () => {
    expect(pickEpic([epic(585), epic(24), epic(300)], 'infra')?.number).toBe(585);
  });
  it('ignores other areas, unlabelled issues and pull requests', () => {
    const issues = [epic(30, { title: 'Epic: UI' }), epic(31, { labels: [] }), epic(32, { pull_request: {} })];
    expect(pickEpic(issues, 'infra')).toBeNull();
  });
  it('returns null when there is none', () => {
    expect(pickEpic([], 'infra')).toBeNull();
  });
});

describe('currentEpic / fileUnderEpic', () => {
  const issue = { id: 1234, number: 99 };
  const requestFor = (epics: EpicIssue[]) => vi.fn<Request>(async (method) => (method === 'GET' ? epics : {}));

  it('files the issue under the open epic the helper finds', async () => {
    const request = requestFor([epic(24, { state: 'closed' }), epic(585)]);
    expect((await currentEpic(request, 'infra'))?.number).toBe(585);
    await fileUnderEpic(request, 'infra', issue);
    expect(request).toHaveBeenLastCalledWith('POST', 'issues/585/sub_issues', { sub_issue_id: 1234 });
  });

  it('files without a parent and warns when the epic is full', async () => {
    const warn = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const request = requestFor([epic(585, { sub_issues_summary: { total: 100 } })]);
    await fileUnderEpic(request, 'infra', issue);
    expect(request.mock.calls.map((c) => c[0])).toEqual(['GET']);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^::warning::.*#585.*roll/);
    warn.mockRestore();
  });

  it('warns and does not fail when there is no epic or linking fails', async () => {
    const warn = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await fileUnderEpic(requestFor([]), 'infra', issue);
    const failing = vi.fn<Request>(async (method) => {
      if (method === 'GET') return [epic(585)];
      throw new Error('boom');
    });
    await fileUnderEpic(failing, 'infra', issue);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
