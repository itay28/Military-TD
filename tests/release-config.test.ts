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

  // A release-as pin forces every release to that version, so it has to go once
  // that version ships (docs/agents/releasing.md → Milestone release).
  it('pins release-as only to a version that has not shipped yet', () => {
    const releaseAs = config.packages['.']?.['release-as'];
    if (releaseAs === undefined) return;
    const parse = (v: string) => v.split('.').map(Number);
    const [pin, current] = [parse(String(releaseAs)), parse(pkg.version)];
    const ahead = pin.findIndex((n, i) => n !== current[i]);
    expect(ahead !== -1 && pin[ahead]! > current[ahead]!, `release-as ${releaseAs} has shipped; remove it`).toBe(true);
  });

  it('pins release-as to 0.1.0 until the first milestone release ships', () => {
    expect(config.packages['.']?.['release-as']).toBe('0.1.0');
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

  it('passes the title through env, never into the shell command', () => {
    expect(titleWorkflow).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
    const runs = [...titleWorkflow.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
    expect(runs).toEqual(['node scripts/pr-title.ts']);
  });
});
