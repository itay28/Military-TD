import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the milestone report workflow (docs/agents/workflow.md → Milestone release) so an edit can't
// silently stop milestones reporting, or let an issue title reach the shell.
const workflow = readFileSync('.github/workflows/milestone-report.yml', 'utf8');
const runs = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('milestone report workflow', () => {
  // The milestone: the dispatch input, the one an issue left (demilestoned), or the closed issue's.
  const milestone = 'inputs.milestone || github.event.milestone.number || github.event.issue.milestone.number';

  it('runs when an issue closes or leaves a milestone, or by hand for a milestone number', () => {
    expect(workflow).toMatch(/^on:\n {2}issues:\n {4}types: \[closed, demilestoned\]\n/m);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}milestone:\n/m);
  });

  it('skips issues without a milestone, and release issues', () => {
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' || ((github.event.milestone || github.event.issue.milestone) && !contains(github.event.issue.labels.*.name, 'release'))",
    );
  });

  it('runs the report script with the milestone number through env', () => {
    expect(runs).toContain('node scripts/milestone-report.ts');
    expect(workflow).toContain(`MILESTONE: \${{ ${milestone} }}`);
  });

  it('passes tokens through env only, never into a run line', () => {
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    // The optional PAT (as in the Release workflow) pushes and opens the PR, so CI runs on it.
    expect(workflow).toContain('PR_TOKEN: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('token: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
    expect(runs.some((r) => r?.includes('${{'))).toBe(false);
  });

  it('can push the report branch and open the PR', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: write\n {2}pull-requests: write\n {2}issues: read\n/m);
  });

  // Keyed on the milestone, so activity in another milestone can't cancel this one's queued run.
  it('runs one report at a time per milestone', () => {
    expect(workflow).toContain(
      `concurrency:\n  group: milestone-report-\${{ ${milestone} }}\n  cancel-in-progress: false\n`,
    );
  });
});
