import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the workflow that keeps the board in step (#162), so an edit can't silently stop it.
const yaml = readFileSync('.github/workflows/board-sync.yml', 'utf8');
const runsOf = (text: string) => [...text.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('board sync workflow', () => {
  it('runs on every PR change that can move a card', () => {
    expect(yaml).toMatch(
      /^ {2}pull_request:\n {4}types: \[opened, reopened, edited, ready_for_review, converted_to_draft, closed\]\n/m,
    );
  });

  it('runs when an issue is assigned or reopened', () => {
    expect(yaml).toMatch(/^ {2}issues:\n {4}types: \[assigned, reopened\]\n/m);
  });

  it('also sweeps on a schedule and on demand, to fix any card that drifted', () => {
    expect(yaml).toMatch(/^ {2}schedule:\n {4}- cron: '\S+ \S+ \S+ \S+ \S+'\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('never runs two syncs at once', () => {
    expect(yaml).toMatch(/^concurrency:\n {2}group: board-sync\n {2}cancel-in-progress: false\n/m);
  });

  it('skips fork PRs, which get no secrets', () => {
    expect(yaml).toContain(
      "    if: github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork\n",
    );
  });

  it('runs the sync with the project token from secrets', () => {
    expect(runsOf(yaml)).toEqual(['node scripts/board-sync.ts']);
    expect(yaml).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
  });
});
