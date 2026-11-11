import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the Update snapshots workflow (#194, #198), so an edit can't silently break baselines.
const yaml = readFileSync('.github/workflows/update-snapshots.yml', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const image = (text: string) => /image: (mcr\.microsoft\.com\/playwright:\S+)/.exec(text)?.[1];

describe('Update snapshots workflow', () => {
  it('runs on the update-snapshots label and by hand', () => {
    expect(yaml).toMatch(/^ {2}pull_request:\n {4}types: \[labeled\]\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
    expect(yaml).toContain("github.event.label.name == 'update-snapshots'");
  });

  it('names each run after its PR, so the PR steward can wait on it (#471)', () => {
    expect(yaml).toContain('run-name: Update snapshots #${{ github.event.pull_request.number || inputs.pr }}');
  });

  it('renders in the same Playwright image as the e2e job', () => {
    expect(image(yaml)).toBeDefined();
    expect(image(yaml)).toBe(image(ci));
  });

  it('renders the PR merged with its base, as e2e tests it, and refuses a conflict', () => {
    expect(yaml).toContain('ref: ${{ needs.resolve.outputs.merge }}');
    expect(yaml).toMatch(/mergeable" = false .*resolve the conflict first/);
  });

  it('pushes only from the job that runs no PR code', () => {
    const render = yaml.slice(yaml.indexOf('  render:'), yaml.indexOf('  commit:'));
    expect(render).not.toContain('secrets.');
    expect(render).toContain('persist-credentials: false');
    expect(yaml.slice(yaml.indexOf('  commit:'))).toContain('token: ${{ secrets.PROJECT_TOKEN }}');
  });

  it('removes the label first on both paths, without failing when it is absent (#470)', () => {
    const resolve = yaml.slice(yaml.indexOf('  resolve:'), yaml.indexOf('  render:'));
    const steps = resolve.slice(resolve.indexOf('    steps:'));
    const first = steps.slice(0, steps.indexOf('- name: Find the PR'));
    expect(first).toContain('Remove the update-snapshots label');
    expect(first).not.toMatch(/^\s+if:/m);
    expect(first).toContain('github.event.pull_request.number || inputs.pr');
    expect(first).toContain('update-snapshots');
    expect(first).toMatch(/\|\| true/);
  });
});
