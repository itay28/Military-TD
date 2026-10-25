import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The CLI agents use to inspect a run without a browser: `npm run scenario -- <name> [--json]`.
function scenario(...args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/scenario.ts', ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const { status, stdout, stderr } = error as { status: number; stdout: string; stderr: string };
    return { status, stdout, stderr };
  }
}

describe('scenario CLI', { timeout: 30_000 }, () => {
  it('prints the outcome, the final Lives and Money, and an event summary', () => {
    const { status, stdout } = scenario('single-infantry-leaks');
    expect(status).toBe(0);
    expect(stdout).toMatch(/Outcome: victory/);
    expect(stdout).toMatch(/Lives: 19/);
    expect(stdout).toMatch(/Money: 100/);
    expect(stdout).toMatch(/enemyLeaked\s+1/);
  });

  it('--json prints the full run as JSON, with the map as its id', () => {
    const { status, stdout } = scenario('one-tower-kills-one-infantry', '--json');
    expect(status).toBe(0);
    const run = JSON.parse(stdout) as {
      outcome: string;
      ticks: number;
      finalState: { map: string };
      events: unknown[];
    };
    expect(run.outcome).toBe('victory');
    expect(run.finalState.map).toBe('mvp');
    expect(run.events.length).toBeGreaterThan(3);
  });

  it('an unknown name exits 1 and lists the scenarios there are', () => {
    const { status, stderr } = scenario('no-such-scenario');
    expect(status).toBe(1);
    expect(stderr).toMatch(/no-such-scenario/);
    expect(stderr).toMatch(/single-infantry-leaks/);
  });

  it('no name exits 1 with usage', () => {
    const { status, stderr } = scenario();
    expect(status).toBe(1);
    expect(stderr).toMatch(/npm run scenario -- <name>/);
  });
});
