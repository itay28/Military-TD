import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the ADR-0004 release setup so an edit can't silently change how versions bump.
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const pkg = readJson('package.json') as { version: string };
const manifest = readJson('.release-please-manifest.json');
const config = readJson('release-please-config.json') as { packages: Record<string, Record<string, unknown>> };
const releaseWorkflow = readFileSync('.github/workflows/release-please.yml', 'utf8');
const titleWorkflow = readFileSync('.github/workflows/pr-title.yml', 'utf8');

describe('release-please', () => {
  it('manifest tracks the root package at the package.json version', () => {
    expect(manifest).toEqual({ '.': pkg.version });
  });

  it('bumps the patch for feat and fix and the minor for breaking changes before 1.0', () => {
    expect(config.packages['.']).toMatchObject({
      'release-type': 'node',
      'bump-minor-pre-major': true,
      'bump-patch-for-minor-pre-major': true,
    });
  });

  it('tags vX.Y.Z and writes CHANGELOG.md', () => {
    expect(config.packages['.']).toMatchObject({
      'include-component-in-tag': false,
      'changelog-path': 'CHANGELOG.md',
    });
    expect(config.packages['.']?.['include-v-in-tag']).not.toBe(false);
  });

  it('runs on pushes to main with the manifest config', () => {
    expect(releaseWorkflow).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n/m);
    expect(releaseWorkflow).toContain('uses: googleapis/release-please-action@v4');
    expect(releaseWorkflow).toContain('config-file: release-please-config.json');
    expect(releaseWorkflow).toContain('manifest-file: .release-please-manifest.json');
  });

  it('exposes release_created and tag_name for the deploy job', () => {
    expect(releaseWorkflow).toMatch(/release_created: \$\{\{ steps\.release\.outputs\.release_created \}\}/);
    expect(releaseWorkflow).toMatch(/tag_name: \$\{\{ steps\.release\.outputs\.tag_name \}\}/);
  });
});

describe('pr title workflow', () => {
  it('runs when a PR is opened, edited, synchronized or reopened', () => {
    expect(titleWorkflow).toMatch(/types: \[opened, edited, synchronize, reopened\]/);
  });

  it('has one job named pr-title', () => {
    expect(titleWorkflow).toMatch(/^jobs:\n {2}pr-title:\n {4}name: pr-title\n/m);
  });

  // A push and a title edit at once (release-please) start two runs on the same commit; cancelling
  // one shows a ✗ next to the green run (#257).
  it('never cancels a run', () => {
    expect(titleWorkflow).not.toMatch(/^concurrency:/m);
    expect(titleWorkflow).not.toContain('cancel-in-progress');
  });

  // Overlapping runs must agree, so each one checks the title the PR has now, not its event's copy.
  it("checks the PR's current title from the API", () => {
    expect(titleWorkflow).toMatch(/^ {2}pull-requests: read$/m);
    expect(titleWorkflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(titleWorkflow).toContain('PR_NUMBER: ${{ github.event.pull_request.number }}');
    expect(titleWorkflow).toContain('PR_TITLE="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" --jq .title)"');
    expect(titleWorkflow).toContain('node scripts/pr-title.ts');
  });

  it('never puts the title into the shell command', () => {
    expect(titleWorkflow).not.toContain('github.event.pull_request.title');
  });
});
