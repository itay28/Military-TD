import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the CI workflow so an edit can't silently rename the required `ci` check or drop a step.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> };

/** The text of one job, from its id to the next job (or the end). */
const job = (id: string): string => {
  const match = new RegExp(`^ {2}${id}:\\n[\\s\\S]*?(?=^ {2}\\w|(?![\\s\\S]))`, 'm').exec(workflow);
  if (!match) throw new Error(`ci.yml has no ${id} job`);
  return match[0];
};
const runs = (text: string) => [...text.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('ci workflow', () => {
  it('starts with one job named ci, the required check', () => {
    expect(workflow).toMatch(/^jobs:\n {2}ci:\n {4}name: ci\n/m);
  });

  it('runs on pull requests and on pushes to main', () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n/m);
  });

  it('uses the Node version from .nvmrc with the npm cache in every job', () => {
    for (const id of ['ci', 'e2e']) {
      expect(job(id)).toContain('node-version-file: .nvmrc');
      expect(job(id)).toContain('cache: npm');
    }
  });

  it('ci runs npm ci, then typecheck, lint, format check, test, build and the itch.io build check in that order', () => {
    expect(runs(job('ci'))).toEqual([
      'npm ci',
      'npm run typecheck',
      'npm run lint',
      'npm run format:check',
      'npm test',
      'npm run build',
      'node scripts/itch-build.ts dist',
    ]);
  });

  it('e2e runs npm ci, then the e2e tests', () => {
    expect(job('e2e')).toMatch(/^ {4}name: e2e$/m);
    expect(runs(job('e2e'))).toEqual(['npm ci', 'npm run test:e2e']);
  });

  it('e2e runs in the Playwright container that matches the @playwright/test version', () => {
    const version = pkg.devDependencies['@playwright/test'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/); // pinned exactly, or the browser could drift from the image
    expect(job('e2e')).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble`);
  });

  it('e2e uploads the report and traces when it fails', () => {
    const e2e = job('e2e');
    expect(e2e).toMatch(/if: failure\(\)\n\s+uses: actions\/upload-artifact@v4/);
    expect(e2e).toContain('playwright-report/');
    expect(e2e).toContain('test-results/');
  });
});
