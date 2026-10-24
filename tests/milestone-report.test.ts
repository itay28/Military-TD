import { describe, expect, it } from 'vitest';
import {
  addedPrs,
  buildReport,
  extractNotes,
  isMilestoneDone,
  movedOut,
  parseMilestoneIssues,
  previousReleaseTag,
  releaseIssue,
  releaseVersion,
  reportPrBody,
  reportPrTitle,
  type MilestoneIssue,
  type ReportData,
} from '../scripts/milestone-report';

// The milestone report PR audits a milestone and triggers its 0.N.0 release (docs/agents/workflow.md → Milestone release).
const issue = (number: number, over: Partial<MilestoneIssue> = {}): MilestoneIssue => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/itay28/Military-TD/issues/${number}`,
  state: 'closed',
  stateReason: 'completed',
  labels: [],
  closedBy: [],
  ...over,
});
const release = issue(101, { title: 'Release v0.1.0', state: 'open', stateReason: null, labels: ['release'] });

describe('releaseVersion', () => {
  it('reads the version from the milestone title', () => {
    expect(releaseVersion('v0.1.0 — MVP')).toBe('0.1.0');
    expect(releaseVersion('v1.0.0 — Release')).toBe('1.0.0');
  });

  it('returns null for a title without a version', () => {
    expect(releaseVersion('Backlog')).toBeNull();
    expect(releaseVersion('Ideas v2')).toBeNull();
  });
});

describe('parseMilestoneIssues', () => {
  it('maps state, state reason, labels and the merged PRs that closed each issue, in number order', () => {
    const pr = (number: number, merged: boolean) => ({
      number,
      title: `feat: thing ${number}`,
      url: `https://github.com/itay28/Military-TD/pull/${number}`,
      merged,
    });
    const nodes = [
      {
        number: 4,
        title: 'Scaffold',
        url: 'https://github.com/itay28/Military-TD/issues/4',
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        labels: { nodes: [{ name: 'area:infra' }] },
        closedByPullRequestsReferences: { nodes: [pr(88, false), pr(89, true)] },
      },
      {
        number: 101,
        title: 'Release v0.1.0',
        url: 'https://github.com/itay28/Military-TD/issues/101',
        state: 'OPEN',
        stateReason: null,
        labels: { nodes: [{ name: 'release' }] },
        closedByPullRequestsReferences: { nodes: [] },
      },
    ];
    expect(parseMilestoneIssues([...nodes].reverse())).toEqual([
      issue(4, {
        title: 'Scaffold',
        labels: ['area:infra'],
        closedBy: [{ number: 89, title: 'feat: thing 89', url: 'https://github.com/itay28/Military-TD/pull/89' }],
      }),
      release,
    ]);
  });
});

describe('movedOut', () => {
  const event = (number: number, from: string, nowIn: string | null, pr = false) => ({
    event: 'demilestoned',
    milestone: { title: from },
    issue: {
      number,
      title: `Issue ${number}`,
      html_url: `https://github.com/itay28/Military-TD/issues/${number}`,
      milestone: nowIn ? { title: nowIn } : null,
      ...(pr ? { pull_request: {} } : {}),
    },
  });

  it('lists issues removed from this milestone once each, with where they are now', () => {
    const events = [
      event(37, 'v0.1.0 — MVP', 'v0.2.0 — Combat depth'),
      event(37, 'v0.1.0 — MVP', 'v0.2.0 — Combat depth'),
      event(45, 'v0.1.0 — MVP', null),
    ];
    expect(movedOut(events, 'v0.1.0 — MVP', [])).toEqual([
      {
        number: 37,
        title: 'Issue 37',
        url: 'https://github.com/itay28/Military-TD/issues/37',
        nowIn: 'v0.2.0 — Combat depth',
      },
      { number: 45, title: 'Issue 45', url: 'https://github.com/itay28/Military-TD/issues/45', nowIn: null },
    ]);
  });

  it('skips other events, other milestones, pull requests and issues that came back', () => {
    const events = [
      { ...event(1, 'v0.1.0 — MVP', null), event: 'milestoned' },
      event(2, 'v0.2.0 — Combat depth', null),
      event(3, 'v0.1.0 — MVP', null, true),
      event(4, 'v0.1.0 — MVP', 'v0.1.0 — MVP'),
    ];
    expect(movedOut(events, 'v0.1.0 — MVP', [4])).toEqual([]);
  });
});

describe('addedPrs', () => {
  const merged = (number: number, title: string, mergedAt: string, closes: number[] = []) => ({
    number,
    title,
    url: `https://github.com/itay28/Military-TD/pull/${number}`,
    mergedAt,
    closingIssuesReferences: closes.map((n) => ({ number: n })),
  });

  it('keeps PRs merged after the previous release that close no issue in the milestone', () => {
    const prs = [
      merged(110, 'docs: tidy', '2026-10-24T10:00:00Z'),
      merged(113, 'feat: tower targeting', '2026-10-24T11:00:00Z', [8]),
      merged(114, 'ci: other milestone', '2026-10-24T12:00:00Z', [60]),
      merged(90, 'feat: old', '2026-09-01T00:00:00Z'),
      merged(91, 'chore(main): release 0.0.5', '2026-10-24T09:00:00Z'),
    ];
    expect(addedPrs(prs, [8, 101], '2026-09-30T00:00:00Z').map((pr) => pr.number)).toEqual([110, 114]);
  });

  it('counts every merged PR before the first release, oldest first', () => {
    const prs = [merged(2, 'feat: b', '2026-10-02T00:00:00Z'), merged(1, 'feat: a', '2026-10-01T00:00:00Z')];
    expect(addedPrs(prs, [], null)).toEqual([
      { number: 1, title: 'feat: a', url: 'https://github.com/itay28/Military-TD/pull/1' },
      { number: 2, title: 'feat: b', url: 'https://github.com/itay28/Military-TD/pull/2' },
    ]);
  });
});

describe('buildReport', () => {
  const url = (kind: string, n: number) => `https://github.com/itay28/Military-TD/${kind}/${n}`;
  const data: ReportData = {
    version: '0.1.0',
    milestone: { title: 'v0.1.0 — MVP', url: 'https://github.com/itay28/Military-TD/milestone/1' },
    since: null,
    issues: [
      issue(4, { title: 'Scaffold', closedBy: [{ number: 89, title: 'feat: scaffold', url: url('pull', 89) }] }),
      issue(6, { title: 'Map [grid]' }),
      issue(7, { title: 'Sound', stateReason: 'not_planned' }),
      issue(9, { title: 'Dupe', stateReason: 'duplicate' }),
      release,
    ],
    movedOut: [
      { number: 37, title: 'Bosses', url: url('issues', 37), nowIn: 'v0.2.0 — Combat depth' },
      { number: 45, title: 'Weather', url: url('issues', 45), nowIn: null },
    ],
    added: [{ number: 111, title: 'docs: release flow', url: url('pull', 111) }],
  };
  const section = (md: string, name: string): string[] => {
    const body = md.split(`\n## ${name}\n`)[1]?.split('\n## ')[0] ?? '';
    return body.split('\n').filter((line) => line.trim() !== '');
  };

  it('opens with the version, the milestone, the release issue and where Added starts', () => {
    const md = buildReport(data);
    expect(md.startsWith('# Release 0.1.0\n')).toBe(true);
    expect(md).toContain('[v0.1.0 — MVP](https://github.com/itay28/Military-TD/milestone/1)');
    expect(md).toContain(`[#101 Release v0.1.0](${url('issues', 101)})`);
    expect(md).toContain('since the start of the project');
    expect(buildReport({ ...data, since: 'v0.1.0' })).toContain('since `v0.1.0`');
  });

  it('plans every issue but the release issue, with its outcome', () => {
    expect(section(buildReport(data), 'Planned')).toEqual([
      `- [#4 Scaffold](${url('issues', 4)}): delivered`,
      `- [#6 Map \\[grid\\]](${url('issues', 6)}): delivered`,
      `- [#7 Sound](${url('issues', 7)}): skipped`,
      `- [#9 Dupe](${url('issues', 9)}): skipped`,
    ]);
  });

  it('lists delivered issues with the PRs that closed them', () => {
    expect(section(buildReport(data), 'Delivered')).toEqual([
      `- [#4 Scaffold](${url('issues', 4)}) by [#89 feat: scaffold](${url('pull', 89)})`,
      `- [#6 Map \\[grid\\]](${url('issues', 6)}), no PR`,
    ]);
  });

  it('lists skipped, moved-out and added work', () => {
    const md = buildReport(data);
    expect(section(md, 'Skipped')).toEqual([`- [#7 Sound](${url('issues', 7)})`, `- [#9 Dupe](${url('issues', 9)})`]);
    expect(section(md, 'Moved out')).toEqual([
      `- [#37 Bosses](${url('issues', 37)}), now in v0.2.0 — Combat depth`,
      `- [#45 Weather](${url('issues', 45)}), now in no milestone`,
    ]);
    expect(section(md, 'Added')).toEqual([`- [#111 docs: release flow](${url('pull', 111)})`]);
  });

  it('says None. for an empty section', () => {
    const md = buildReport({ ...data, issues: [release], movedOut: [], added: [] });
    for (const name of ['Planned', 'Delivered', 'Skipped', 'Moved out', 'Added']) {
      expect(section(md, name)).toEqual(['None.']);
    }
  });

  it('ends with a Notes section for the human that survives a regeneration', () => {
    const fresh = buildReport(data);
    expect(fresh.endsWith('\n')).toBe(true);
    expect(extractNotes(fresh)).toBeUndefined();

    const edited = fresh.replace(/\n## Notes\n[\s\S]*$/, '\n## Notes\n\nFirst playable build.\n\n- Known: no sound.\n');
    expect(extractNotes(edited)).toBe('First playable build.\n\n- Known: no sound.');
    const regenerated = buildReport({ ...data, added: [] }, extractNotes(edited));
    expect(regenerated.endsWith('\n## Notes\n\nFirst playable build.\n\n- Known: no sound.\n')).toBe(true);
  });
});

describe('report PR', () => {
  const body = reportPrBody({
    version: '0.1.0',
    milestone: { title: 'v0.1.0 — MVP', url: 'https://github.com/itay28/Military-TD/milestone/1' },
    releaseIssue: 101,
    runUrl: 'https://github.com/itay28/Military-TD/actions/runs/1',
  });
  const paragraphs = body.trimEnd().split(/\n\s*\n/);

  it('is titled chore: release 0.N.0', () => {
    expect(reportPrTitle('0.1.0')).toBe('chore: release 0.1.0');
  });

  it('refs the release issue instead of closing it', () => {
    expect(body).toMatch(/^Refs #101$/m);
    expect(body).not.toMatch(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?) #\d/i);
  });

  it('ends with Release-As as its own paragraph, right after the generated-with line', () => {
    expect(paragraphs.at(-1)).toBe('Release-As: 0.1.0');
    expect(paragraphs.at(-2)).toMatch(/^🤖 Generated with /);
  });
});

describe('previousReleaseTag', () => {
  it("picks the previous milestone's release, not a later patch release", () => {
    expect(previousReleaseTag(['v0.1.0', 'v0.1.1', 'v0.2.0', 'v0.2.3', 'v0.0.4'], '0.3.0')).toBe('v0.2.0');
  });

  it('ignores newer and non-version tags', () => {
    expect(previousReleaseTag(['v0.2.0', 'v0.4.0', 'nightly', 'v0.3.0-rc.1', 'v0.3.0'], '0.3.0')).toBe('v0.2.0');
  });

  it('compares versions numerically and crosses majors', () => {
    expect(previousReleaseTag(['v0.9.0', 'v0.10.0', 'v0.2.0'], '1.0.0')).toBe('v0.10.0');
  });

  it('is null when no milestone has been released yet', () => {
    expect(previousReleaseTag(['v0.0.1', 'v0.0.2'], '0.1.0')).toBeNull();
    expect(previousReleaseTag([], '0.1.0')).toBeNull();
  });
});

describe('isMilestoneDone', () => {
  it('is true when only the release issue is open', () => {
    expect(isMilestoneDone([issue(4), release, issue(5, { stateReason: 'not_planned' })])).toBe(true);
    expect(releaseIssue([issue(4), release])).toBe(release);
  });

  it('is false while another issue is open', () => {
    expect(isMilestoneDone([issue(4, { state: 'open', stateReason: null }), release])).toBe(false);
  });

  it('is false without an open release issue, so a released milestone never reports again', () => {
    expect(isMilestoneDone([issue(4)])).toBe(false);
    expect(isMilestoneDone([issue(4), { ...release, state: 'closed', stateReason: 'completed' }])).toBe(false);
  });
});
