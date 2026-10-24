import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the CI workflow so an edit can't silently rename the required `ci` check or drop a step.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('ci workflow', () => {
  it('has one job named ci, the required check', () => {
    expect(workflow).toMatch(/^jobs:\n {2}ci:\n {4}name: ci\n/m);
  });

  it('runs on pull requests and on pushes to main', () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m);
  });

  it('uses the Node version from .nvmrc with the npm cache', () => {
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(workflow).toContain('cache: npm');
  });

  it('runs npm ci, then typecheck, lint, format check, test and build in that order', () => {
    const runs = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
    expect(runs).toEqual([
      'npm ci',
      'npm run typecheck',
      'npm run lint',
      'npm run format:check',
      'npm test',
      'npm run build',
    ]);
  });
});
