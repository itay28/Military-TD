import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the failure-report workflow (#207) so an edit can't silently stop post-merge failures becoming issues.
const wf = readFileSync('.github/workflows/failure-report.yml', 'utf8');
const runs = [...wf.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('failure-report workflow', () => {
  it('runs when CI, Release or Deploy complete', () => {
    expect(wf).toMatch(/^on:\n {2}workflow_run:\n {4}workflows: \[CI, Release, Deploy\]\n {4}types: \[completed\]\n/m);
  });

  // A skipped job isn't billed: drop the runs scripts/failure-report.ts would ignore anyway (#217).
  it('starts the job only for Deploy or runs on main', () => {
    expect(wf).toContain(
      "if: github.event.workflow_run.name == 'Deploy' || github.event.workflow_run.head_branch == 'main'",
    );
  });

  it('can write issues but not code', () => {
    expect(wf).toMatch(/^permissions:\n {2}contents: read\n {2}issues: write\n {2}actions: read\n/m);
  });

  it('files the report, passing the tokens through env', () => {
    expect(runs).toEqual(['node scripts/failure-report.ts']);
    expect(wf).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(wf).toContain('NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}');
    expect(runs.some((r) => r?.includes('secrets.'))).toBe(false);
  });

  it('is listed with the notify triggers in the Hand-off docs', () => {
    expect(readFileSync('docs/agents/issue-tracker.md', 'utf8')).toContain('failure-report');
  });
});
