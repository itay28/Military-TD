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

  it('never runs two at once', () => {
    expect(yaml).toMatch(/^concurrency:\n {2}group: pr-steward\n {2}cancel-in-progress: false\n/m);
  });

  it('runs the steward with the project token, its switches and its secrets', () => {
    expect(runsOf(yaml)).toEqual(['node scripts/pr-steward.ts']);
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
