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

  it('runs on every issue change the Ready rule depends on: assignee, blocker closed, label, milestone', () => {
    expect(yaml).toMatch(
      /^ {2}issues:\n {4}types: \[assigned, reopened, closed, labeled, unlabeled, milestoned, demilestoned\]\n/m,
    );
  });

  it('also sweeps on a schedule and on demand, to fix any card that drifted', () => {
    expect(yaml).toMatch(/^ {2}schedule:\n {4}- cron: '\S+ \S+ \S+ \S+ \S+'\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('sweeps hourly, so a dead implement session is retried within about 2 h (#201)', () => {
    expect(yaml).toMatch(/^ {4}- cron: '\d+ \* \* \* \*'\n/m);
  });

  it('never runs two syncs at once', () => {
    expect(yaml).toMatch(/^ {4}concurrency:\n {6}group: board-sync\n {6}cancel-in-progress: false\n/m);
  });

  it('skips fork PRs, which get no secrets', () => {
    expect(yaml).toContain("(github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork)");
  });

  it('runs the sync with the project token from secrets', () => {
    expect(runsOf(yaml)).toEqual(['sleep 60', 'node scripts/board-sync.ts']);
    expect(yaml).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
  });
});

describe('board sync workflow: auto-start', () => {
  it('passes the auto-start switches from repo variables', () => {
    expect(yaml).toContain('AUTO_SPAWN: ${{ vars.AUTO_SPAWN }}');
    expect(yaml).toContain('AUTO_STACK: ${{ vars.AUTO_STACK }}');
  });

  it('passes both routine triggers from secrets', () => {
    for (const name of ['ROUTINE_SONNET_URL', 'ROUTINE_SONNET_TOKEN', 'ROUTINE_OPUS_URL', 'ROUTINE_OPUS_TOKEN'])
      expect(yaml).toContain(`${name}: \${{ secrets.${name} }}`);
  });
});

// A burst of events (a relabel, an agent's comments, CI finishing) ends in one sweep (#293).
describe('board sync workflow: debounce', () => {
  it('makes each event run wait in a group where a newer event cancels it', () => {
    expect(yaml).toMatch(
      /^ {2}debounce:\n(?: {4}.*\n)*? {4}concurrency:\n {6}group: board-sync-debounce\n {6}cancel-in-progress: true\n/m,
    );
    expect(yaml).toMatch(/^ {2}debounce:\n(?: {4,}.*\n)*? {8}run: sleep 60\n/m);
  });

  it('lets scheduled and manual runs skip the wait', () => {
    expect(yaml).toContain("github.event_name != 'schedule' && github.event_name != 'workflow_dispatch'");
  });

  it('sweeps only after the wait finished, or for a scheduled or manual run', () => {
    expect(yaml).toMatch(/^ {4}needs: debounce\n/m);
    expect(yaml).toContain(
      "always() && (needs.debounce.result == 'success' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch')",
    );
  });
});
