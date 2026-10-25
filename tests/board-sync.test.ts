import { describe, expect, it } from 'vitest';
import { closingIssues, desiredStatus, planMoves, type BoardIssue, type PullRequest } from '../scripts/board-sync';

// The board-sync workflow keeps each issue's card in step with its PRs and assignees (docs/agents/issue-tracker.md).
describe('closingIssues', () => {
  it.each([
    ['Closes #12', [12]],
    ['closes #12', [12]],
    ['Fixes: #7', [7]],
    ['fixed #7 and resolves #8', [7, 8]],
    ['Resolved #3, close #4', [3, 4]],
    ['Closes https://github.com/itay28/Military-TD/issues/31', [31]],
    ['Closes itay28/Military-TD#31', [31]],
  ])('reads %s', (body, issues) => {
    expect(closingIssues(body, [])).toEqual(issues);
  });

  it('ignores mentions without a closing keyword, and other repos', () => {
    expect(closingIssues('Part of #24, see #30', [])).toEqual([]);
    expect(closingIssues('Closes other/repo#5 and https://github.com/other/repo/issues/6', [])).toEqual([]);
    expect(closingIssues('enclosesed #9', [])).toEqual([]);
  });

  it("merges the body with GitHub's own links, without duplicates", () => {
    expect(closingIssues('Closes #12\nFixes #13', [12, 40])).toEqual([12, 40, 13]);
  });
});

const ready: PullRequest = { isDraft: false, state: 'OPEN', base: 'main', issues: [1] };
const draft: PullRequest = { ...ready, isDraft: true };
const issue = (over: Partial<BoardIssue> = {}): BoardIssue => ({
  number: 1,
  status: 'Ready',
  assigned: false,
  release: false,
  ...over,
});

describe('desiredStatus', () => {
  it('moves the card to In review when a PR is ready, and to In progress while it is a draft', () => {
    expect(desiredStatus(issue(), [ready])).toBe('In review');
    expect(desiredStatus(issue({ status: 'In review' }), [draft])).toBe('In progress');
  });

  it('prefers In review when one PR is ready and another is a draft', () => {
    expect(desiredStatus(issue(), [draft, ready])).toBe('In review');
  });

  it('moves an assigned issue with no open PR to In progress', () => {
    expect(desiredStatus(issue({ assigned: true }), [])).toBe('In progress');
    expect(desiredStatus(issue({ assigned: true, status: 'Backlog' }), [])).toBe('In progress');
    expect(desiredStatus(issue({ assigned: true, status: undefined }), [])).toBe('In progress');
  });

  it('sends the card back to In progress when its PR is closed without merging', () => {
    const closed: PullRequest = { ...ready, state: 'CLOSED' };
    expect(desiredStatus(issue({ assigned: true, status: 'In review' }), [closed])).toBe('In progress');
  });

  it('keeps In review for a stacked PR merged into its parent branch, since the issue only closes on main', () => {
    const stacked: PullRequest = { ...ready, state: 'MERGED', base: 'feat/30-parent' };
    expect(desiredStatus(issue({ assigned: true, status: 'In progress' }), [stacked], 'main')).toBe('In review');
  });

  it('ignores a PR merged into main (closing the issue moves it to Done)', () => {
    const merged: PullRequest = { ...ready, state: 'MERGED' };
    expect(desiredStatus(issue(), [merged], 'main')).toBeUndefined();
  });

  it('never moves Done cards or release issues', () => {
    expect(desiredStatus(issue({ status: 'Done' }), [ready])).toBeUndefined();
    expect(desiredStatus(issue({ release: true, assigned: true }), [ready])).toBeUndefined();
  });

  it('leaves unassigned issues with no PR where they are', () => {
    expect(desiredStatus(issue(), [])).toBeUndefined();
    expect(desiredStatus(issue({ status: 'In progress' }), [])).toBeUndefined();
  });

  it('returns nothing when the card is already right', () => {
    expect(desiredStatus(issue({ status: 'In review' }), [ready])).toBeUndefined();
    expect(desiredStatus(issue({ status: 'In progress', assigned: true }), [])).toBeUndefined();
  });
});

describe('planMoves', () => {
  it('matches PRs to the issues they close and lists only the cards that change', () => {
    const issues = [
      issue({ number: 1, status: 'In progress' }),
      issue({ number: 2, status: 'In progress', assigned: true }),
      issue({ number: 3, status: 'Ready', assigned: true }),
      issue({ number: 4, status: 'Done' }),
    ];
    const prs: PullRequest[] = [
      { ...ready, issues: [1, 4] },
      { ...draft, issues: [2] },
    ];
    expect(planMoves(issues, prs, 'main')).toEqual([
      { issue: 1, from: 'In progress', to: 'In review' },
      { issue: 3, from: 'Ready', to: 'In progress' },
    ]);
  });
});
