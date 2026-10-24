import { describe, expect, it } from 'vitest';
import { findPrCommand, prFromOutput, targetStatus } from '../scripts/board-status';

// The PostToolUse hook keeps an issue's card in step with its PR's draft state (docs/agents/issue-tracker.md).
describe('findPrCommand', () => {
  it.each([
    ['gh pr ready', {}],
    ['gh pr ready 113', { pr: '113' }],
    ['gh pr ready --undo 113', { pr: '113' }],
    ['gh pr ready 113 --undo', { pr: '113' }],
    [
      'gh pr ready https://github.com/itay28/Military-TD/pull/113',
      { pr: 'https://github.com/itay28/Military-TD/pull/113' },
    ],
  ])('matches %s', (command, match) => {
    expect(findPrCommand(command)).toEqual(match);
  });

  it('finds the gh call inside a chained command', () => {
    expect(findPrCommand('cd "D:/repo" && gh pr ready 113 && gh issue comment 8 --body x')).toEqual({ pr: '113' });
    expect(findPrCommand('npm run check; gh pr ready 113')).toEqual({ pr: '113' });
  });

  it('matches gh.exe called by full path, as PowerShell sessions do', () => {
    expect(findPrCommand('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr ready 113')).toEqual({ pr: '113' });
  });

  it('matches gh pr create without --draft; the PR number then comes from the output', () => {
    expect(findPrCommand('gh pr create --base main --title "docs: x" --body-file b.md')).toEqual({});
  });

  it('ignores gh pr create --draft and other commands', () => {
    expect(findPrCommand('gh pr create --draft --title "feat: x"')).toBeUndefined();
    expect(findPrCommand('gh pr create -d --title "feat: x"')).toBeUndefined();
    expect(findPrCommand('gh pr view 113')).toBeUndefined();
    expect(findPrCommand('gh pr checks 113 --watch')).toBeUndefined();
    expect(findPrCommand('npm test')).toBeUndefined();
  });
});

describe('prFromOutput', () => {
  it('reads the number from the PR URL that gh pr create prints', () => {
    expect(prFromOutput('Creating pull request...\nhttps://github.com/itay28/Military-TD/pull/116\n')).toBe('116');
  });

  it('is undefined when there is no PR URL', () => {
    expect(prFromOutput('✓ Pull request itay28/Military-TD#113 is marked as "ready for review"')).toBeUndefined();
  });
});

describe('targetStatus', () => {
  const ready = { isDraft: false, state: 'OPEN' } as const;
  const draft = { isDraft: true, state: 'OPEN' } as const;

  it('an open PR that is ready for review puts its card In review', () => {
    expect(targetStatus(ready, 'In progress')).toBe('In review');
  });

  it('a draft PR puts its card back In progress', () => {
    expect(targetStatus(draft, 'In review')).toBe('In progress');
  });

  it('leaves a card that already has the right status', () => {
    expect(targetStatus(ready, 'In review')).toBeUndefined();
    expect(targetStatus(draft, 'In progress')).toBeUndefined();
  });

  it('never touches a Done or Backlog card', () => {
    expect(targetStatus(ready, 'Done')).toBeUndefined();
    expect(targetStatus(draft, 'Backlog')).toBeUndefined();
  });

  it('leaves the card alone when the PR is closed or merged', () => {
    expect(targetStatus({ isDraft: false, state: 'CLOSED' }, 'In progress')).toBeUndefined();
    expect(targetStatus({ isDraft: false, state: 'MERGED' }, 'In progress')).toBeUndefined();
  });
});
