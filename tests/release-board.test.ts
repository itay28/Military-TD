import { describe, expect, it } from 'vitest';
import { milestoneVersion, releaseIssuesToStart, releaseToClose } from '../scripts/release-board';

describe('milestoneVersion', () => {
  it.each([
    ['v0.1.0', '0.1.0'],
    ['v0.9.0', '0.9.0'],
    ['v1.0.0', '1.0.0'],
    ['v2.0.0', '2.0.0'],
  ])('%s is a milestone version', (tag, version) => {
    expect(milestoneVersion(tag)).toBe(version);
  });

  it.each(['v0.1.1', 'v1.0.1', 'v1.1.0', 'v0.0.0', 'v0.2.0-beta.1', '0.2.0', 'main'])(
    '%s is not a milestone version',
    (tag) => {
      expect(milestoneVersion(tag)).toBeNull();
    },
  );
});

describe('releaseIssuesToStart', () => {
  const release = (number: number, milestone: number, status: string | null) => ({ number, milestone, status });

  it.each(['Backlog', 'Ready'])("a PR closing an issue moves its milestone's release issue from %s", (status) => {
    expect(releaseIssuesToStart([{ number: 8, milestone: 1 }], [release(101, 1, status)])).toEqual([101]);
  });

  it.each(['In progress', 'In review', 'Done', null])('leaves a release issue whose status is %s', (status) => {
    expect(releaseIssuesToStart([{ number: 8, milestone: 1 }], [release(101, 1, status)])).toEqual([]);
  });

  it("ignores closing issues without a milestone and other milestones' release issues", () => {
    expect(
      releaseIssuesToStart(
        [
          { number: 8, milestone: null },
          { number: 9, milestone: 2 },
        ],
        [release(101, 1, 'Backlog'), release(102, 2, 'Backlog')],
      ),
    ).toEqual([102]);
  });

  it('moves a release issue once when several closing issues share its milestone', () => {
    expect(
      releaseIssuesToStart(
        [
          { number: 8, milestone: 1 },
          { number: 9, milestone: 1 },
        ],
        [release(101, 1, 'Ready')],
      ),
    ).toEqual([101]);
  });
});

describe('releaseToClose', () => {
  const milestones = [
    { number: 1, title: 'v0.1.0 — MVP', state: 'open' as const },
    { number: 2, title: 'v0.10.0 — Later', state: 'open' as const },
    { number: 5, title: 'v1.0.0 — Release', state: 'closed' as const },
  ];
  const releaseIssues = [
    { number: 101, milestone: 1 },
    { number: 110, milestone: 5 },
    { number: 120, milestone: 2 },
  ];

  it("a milestone release closes the milestone's release issue and the milestone", () => {
    expect(releaseToClose('v0.1.0', milestones, releaseIssues)).toEqual({
      milestone: 1,
      closeMilestone: true,
      issues: [101],
    });
  });

  it('a patch release closes nothing', () => {
    expect(releaseToClose('v0.1.1', milestones, releaseIssues)).toBeNull();
  });

  it('a milestone version with no matching milestone closes nothing', () => {
    expect(releaseToClose('v0.3.0', milestones, releaseIssues)).toBeNull();
  });

  it("doesn't close a milestone that is already closed", () => {
    expect(releaseToClose('v1.0.0', milestones, releaseIssues)).toEqual({
      milestone: 5,
      closeMilestone: false,
      issues: [110],
    });
  });
});
