import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the PR steward workflow (#168), so an edit can't silently stop it.
const yaml = readFileSync('.github/workflows/pr-steward.yml', 'utf8');
const runsOf = (text: string) => [...text.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('PR steward workflow', () => {
  it('runs after CI and the CI review finish', () => {
    expect(yaml).toMatch(/^ {2}workflow_run:\n {4}workflows: \[CI, Claude Code Review\]\n {4}types: \[completed\]\n/m);
  });

  it('runs on PR comments and reviews, a push to main, a schedule and on demand', () => {
    expect(yaml).toMatch(/^ {2}issue_comment:\n {4}types: \[created\]\n/m);
    expect(yaml).toMatch(/^ {2}pull_request_review:\n {4}types: \[submitted\]\n/m);
    expect(yaml).toMatch(/^ {2}push:\n {4}branches: \[main\]\n/m);
    expect(yaml).toMatch(/^ {2}schedule:\n {4}- cron: '\S+ \S+ \S+ \S+ \S+'\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  // A public repo lets anyone comment; only the maintainer's comments and reviews may wake it (#221).
  it('skips comments and reviews from people outside the repo', () => {
    for (const who of ['comment', 'review'])
      expect(yaml).toContain(
        `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.${who}.author_association)`,
      );
  });

  it('runs hourly, so a round that died is retried soon after its 1 hour timeout (#196)', () => {
    expect(yaml).toMatch(/^ {4}- cron: '\d+ \* \* \* \*'\n/m);
  });

  it('never runs two at once', () => {
    expect(yaml).toMatch(/^ {4}concurrency:\n {6}group: pr-steward\n {6}cancel-in-progress: false\n/m);
  });

  it('runs the steward with the project token, its switches and its secrets', () => {
    expect(runsOf(yaml)).toEqual(['sleep 60', 'node scripts/pr-steward.ts']);
    for (const line of [
      'PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}',
      'AUTO_STEWARD: ${{ vars.AUTO_STEWARD }}',
      'AUTO_MERGE: ${{ vars.AUTO_MERGE }}',
      'ROUTINE_STEWARD_URL: ${{ secrets.ROUTINE_STEWARD_URL }}',
      'ROUTINE_STEWARD_TOKEN: ${{ secrets.ROUTINE_STEWARD_TOKEN }}',
    ])
      expect(yaml).toContain(line);
  });
});

// A burst of events (a relabel, an agent's comments, CI finishing) ends in one sweep (#293).
describe('PR steward workflow: debounce', () => {
  it('makes each event run wait in a group where a newer event cancels it', () => {
    expect(yaml).toMatch(
      /^ {2}debounce:\n(?: {4}.*\n)*? {4}concurrency:\n {6}group: pr-steward-debounce\n {6}cancel-in-progress: true\n/m,
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
