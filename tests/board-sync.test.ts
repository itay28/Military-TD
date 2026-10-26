import { describe, expect, it } from 'vitest';
import {
  closingIssues,
  currentMilestone,
  desiredStatus,
  planFieldsFromLabels,
  planFieldUpdates,
  planMoves,
  withFieldUpdates,
  type BoardIssue,
  type PullRequest,
} from '../scripts/board-sync';
import { planStarts, type StartIssue } from '../scripts/auto-start';

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
  tracker: false,
  labelled: true,
  blocked: false,
  milestone: null,
  ...over,
});

describe('desiredStatus: the Ready rule (no PR, no assignee)', () => {
  const current = 2;
  const startable = issue({ status: 'Backlog', milestone: 2 });

  it('promotes Backlog to Ready: current milestone, ready-for-agent, unblocked', () => {
    expect(desiredStatus(startable, [], 'main', current)).toBe('Ready');
    expect(desiredStatus({ ...startable, status: undefined }, [], 'main', current)).toBe('Ready');
  });

  it('demotes Ready to Backlog when a rule stops holding', () => {
    const readyCard = { ...startable, status: 'Ready' };
    expect(desiredStatus({ ...readyCard, blocked: true }, [], 'main', current)).toBe('Backlog');
    expect(desiredStatus({ ...readyCard, labelled: false }, [], 'main', current)).toBe('Backlog');
    expect(desiredStatus({ ...readyCard, milestone: 3 }, [], 'main', current)).toBe('Backlog');
    expect(desiredStatus({ ...readyCard, milestone: null }, [], 'main', current)).toBe('Backlog');
  });

  it('makes nothing Ready when there is no open milestone', () => {
    expect(desiredStatus({ ...startable, milestone: null }, [], 'main', null)).toBeUndefined();
    expect(desiredStatus({ ...startable, milestone: null, status: 'Ready' }, [], 'main', null)).toBe('Backlog');
  });

  it('files an unset card under Backlog when it is not startable', () => {
    expect(desiredStatus({ ...startable, status: undefined, blocked: true }, [], 'main', current)).toBe('Backlog');
  });

  it('leaves Backlog and Ready cards that are already right', () => {
    expect(desiredStatus({ ...startable, blocked: true }, [], 'main', current)).toBeUndefined();
    expect(desiredStatus({ ...startable, status: 'Ready' }, [], 'main', current)).toBeUndefined();
  });

  it('lets PRs and assignees win over the Ready rule', () => {
    expect(desiredStatus({ ...startable, assigned: true }, [], 'main', current)).toBe('In progress');
    expect(desiredStatus({ ...startable, blocked: true }, [draft], 'main', current)).toBe('In progress');
  });

  it('never moves In progress / In review cards, Done cards or trackers (release issues, epics) by this rule', () => {
    expect(desiredStatus({ ...startable, status: 'In progress', blocked: true }, [], 'main', current)).toBeUndefined();
    expect(desiredStatus({ ...startable, status: 'In review' }, [], 'main', current)).toBeUndefined();
    expect(desiredStatus({ ...startable, status: 'Done' }, [], 'main', current)).toBeUndefined();
    expect(desiredStatus({ ...startable, tracker: true, labelled: false }, [], 'main', current)).toBeUndefined();
  });
});

describe('currentMilestone', () => {
  const m = (number: number, title: string, dueOn: string | null = null) => ({ number, title, dueOn });

  it('picks the earliest due date first', () => {
    expect(currentMilestone([m(2, 'v0.2.0'), m(4, 'v0.3.0', '2026-12-01'), m(6, 'v0.5.0', '2026-11-01')])).toBe(6);
  });

  it('else the lowest version, compared as numbers', () => {
    expect(currentMilestone([m(9, 'v0.10.0 — Later'), m(8, 'v0.9.0 — Beta'), m(2, 'v0.2.0 — Combat depth')])).toBe(2);
    expect(currentMilestone([m(9, 'v0.10.0'), m(8, 'v0.9.0')])).toBe(8);
  });

  it('is null without open milestones', () => {
    expect(currentMilestone([])).toBeNull();
  });
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
    expect(desiredStatus(issue({ status: 'In review' }), [merged], 'main')).toBeUndefined();
  });

  it('never moves Done cards or trackers (release issues, epics)', () => {
    expect(desiredStatus(issue({ status: 'Done' }), [ready])).toBeUndefined();
    expect(desiredStatus(issue({ tracker: true, assigned: true }), [ready])).toBeUndefined();
  });

  it('leaves In progress and In review cards with no PR and no assignee where they are', () => {
    expect(desiredStatus(issue({ status: 'In review' }), [])).toBeUndefined();
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

// Agents set Size and Priority as labels; Board sync copies them (and `area:*`) to the board (#205).
describe('planFieldsFromLabels', () => {
  it('reads size, priority and area labels', () => {
    expect(planFieldsFromLabels(['size:M', 'priority:P1', 'area:ui', 'enhancement']).fields).toEqual({
      Size: 'M',
      Priority: 'P1',
      Area: 'ui',
    });
  });

  it('takes the bigger Size and the less urgent Priority when two labels disagree', () => {
    expect(planFieldsFromLabels(['size:L', 'size:S', 'priority:P0', 'priority:P2']).fields).toEqual({
      Size: 'L',
      Priority: 'P2',
    });
  });

  it('ignores unknown values: not copied, not removed', () => {
    expect(planFieldsFromLabels(['size:XXL', 'priority:urgent', 'area:music'])).toEqual({
      fields: {},
      removeLabels: [],
    });
  });

  it('leaves Area alone when two area labels disagree', () => {
    expect(planFieldsFromLabels(['area:ui', 'area:core']).fields).toEqual({});
  });

  it('removes the size and priority labels it read, never area labels', () => {
    expect(planFieldsFromLabels(['size:S', 'size:M', 'priority:P3', 'area:infra', 'size:XXL']).removeLabels).toEqual([
      'size:S',
      'size:M',
      'priority:P3',
    ]);
  });
});

describe('planFieldUpdates', () => {
  const unset = { Size: undefined, Priority: undefined, Area: undefined };

  it('sets the fields of a labelled issue and removes its labels', () => {
    expect(planFieldUpdates([{ number: 7, labels: ['size:M', 'priority:P1', 'area:ui'], fields: unset }])).toEqual([
      {
        issue: 7,
        set: [
          { field: 'Size', value: 'M' },
          { field: 'Priority', value: 'P1' },
          { field: 'Area', value: 'ui' },
        ],
        removeLabels: ['size:M', 'priority:P1'],
      },
    ]);
  });

  it('only removes the labels when the board already matches', () => {
    expect(
      planFieldUpdates([
        { number: 7, labels: ['size:M', 'priority:P1', 'area:ui'], fields: { Size: 'M', Priority: 'P1', Area: 'ui' } },
      ]),
    ).toEqual([{ issue: 7, set: [], removeLabels: ['size:M', 'priority:P1'] }]);
  });

  it('plans nothing for an issue without field labels, or whose area label already matches', () => {
    expect(
      planFieldUpdates([
        { number: 1, labels: ['enhancement'], fields: unset },
        { number: 2, labels: ['area:core'], fields: { ...unset, Area: 'core' } },
      ]),
    ).toEqual([]);
  });
});

describe('withFieldUpdates', () => {
  const start = (over: Partial<StartIssue> = {}): StartIssue => ({
    number: 9,
    status: 'Ready',
    assigned: false,
    tracker: false,
    labelled: true,
    hold: false,
    needsYou: false,
    autoAgent: false,
    size: undefined,
    priority: undefined,
    milestone: 2,
    blockedBy: [],
    ...over,
  });

  it('lets auto-start see a Size set from a label in the same run', () => {
    const issues = [start()];
    expect(planStarts(issues, [], [2]).noSize).toEqual([9]);
    const updated = withFieldUpdates(issues, planFieldUpdates([{ number: 9, labels: ['size:S'], fields: {} }]));
    expect(planStarts(updated, [], [2]).starts).toEqual([{ issue: 9, base: 'main', model: 'sonnet' }]);
  });

  it('carries the new Priority and leaves other issues as they were', () => {
    const issues = [start(), start({ number: 10, size: 'M' })];
    const updated = withFieldUpdates(issues, [
      { issue: 9, set: [{ field: 'Priority', value: 'P0' }], removeLabels: [] },
    ]);
    expect(updated[0]).toEqual(start({ priority: 'P0' }));
    expect(updated[1]).toBe(issues[1]);
  });
});
