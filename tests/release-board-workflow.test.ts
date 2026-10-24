import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the workflows that move release issues on the board (#97), so an edit can't silently stop them.
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const board = read('.github/workflows/release-board.yml');
const release = read('.github/workflows/release-please.yml');
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
  // The job is the last one in the file.
  const start = release.indexOf('\n  release-issue:\n');
  const job = start > 0 ? release.slice(start) : '';

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
