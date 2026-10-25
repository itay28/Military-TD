import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the workflows that move release issues on the board (#97), so an edit can't silently stop them.
const board = readFileSync('.github/workflows/release-board.yml', 'utf8');
const release = readFileSync('.github/workflows/release-please.yml', 'utf8');
const runsOf = (yaml: string) => [...yaml.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('release board workflow', () => {
  it('runs when a PR is opened or marked ready for review', () => {
    expect(board).toMatch(/^on:\n {2}pull_request:\n {4}types: \[opened, ready_for_review\]\n/m);
  });

  it('starts the release issue for the PR, passing the number and token through env', () => {
    expect(runsOf(board)).toEqual(['node scripts/release-board.ts pr "$PR_NUMBER"']);
    expect(board).toContain('PR_NUMBER: ${{ github.event.pull_request.number }}');
    expect(board).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
  });
});

describe('release workflow: release issue job', () => {
  // From the job's header to the next job's header (or the end of the file).
  const job = /\n {2}release-issue:\n(?:(?! {2}\S).*\n?)*/.exec(release)?.[0] ?? '';

  it('can close issues and milestones (workflow-level issues: write)', () => {
    expect(release).toMatch(/^permissions:\n(?: {2}.*\n)*? {2}issues: write\n/m);
  });

  it('runs after release-please, only when it created a release', () => {
    expect(job).toContain('    needs: release-please\n');
    expect(job).toContain("    if: needs.release-please.outputs.release_created == 'true'\n");
  });

  it('closes the release issue and milestone for the tag, with the token and tag in env', () => {
    expect(runsOf(job)).toEqual(['node scripts/release-board.ts release "$TAG"']);
    expect(job).toContain('TAG: ${{ needs.release-please.outputs.tag_name }}');
    expect(job).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });
});
