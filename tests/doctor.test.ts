import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diagnose, type Facts } from '../scripts/doctor';

// The SessionStart doctor tells the agent what this environment is missing (#162).
const healthy: Facts = {
  environment: 'local',
  node: 'v24.20.0',
  wantedNode: '24',
  nodeModules: true,
  gh: 'logged-in',
};

describe('diagnose', () => {
  it('reports a healthy environment in one line', () => {
    expect(diagnose(healthy)).toEqual({ problems: [], summary: 'doctor (local): ready' });
  });

  it('names the environment', () => {
    expect(diagnose({ ...healthy, environment: 'cloud' }).summary).toBe('doctor (cloud): ready');
  });

  it('flags a node major that differs from .nvmrc', () => {
    expect(diagnose({ ...healthy, node: 'v20.11.0' }).problems).toEqual([
      'node v20.11.0, but .nvmrc wants 24: scripts that run .ts directly may fail',
    ]);
  });

  it('flags missing dependencies', () => {
    expect(diagnose({ ...healthy, nodeModules: false }).problems).toEqual([
      'node_modules missing: run `npm ci` before tests',
    ]);
  });

  it('flags gh missing or logged out', () => {
    expect(diagnose({ ...healthy, gh: 'missing' }).problems).toEqual([
      'gh not found: issue and PR steps need it (GitHub CLI)',
    ]);
    expect(diagnose({ ...healthy, gh: 'logged-out' }).problems).toEqual([
      'gh is not logged in: run `gh auth login`, or set GH_TOKEN',
    ]);
  });

  it('lists every problem in the summary', () => {
    const { summary } = diagnose({ ...healthy, nodeModules: false, gh: 'missing' });
    expect(summary).toBe(
      'doctor (local): 2 problems. node_modules missing: run `npm ci` before tests; gh not found: issue and PR steps need it (GitHub CLI)',
    );
  });
});

describe('.claude/settings.json', () => {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
    hooks?: Record<string, { hooks: { command: string }[] }[]>;
  };
  const commands = (event: string) => (settings.hooks?.[event] ?? []).flatMap((h) => h.hooks.map((c) => c.command));

  it('runs the doctor at session start', () => {
    expect(commands('SessionStart')).toEqual(['node "$CLAUDE_PROJECT_DIR/scripts/doctor.ts" --hook']);
  });

  it('has no client-side board hook: the board moves in GitHub Actions', () => {
    expect(JSON.stringify(settings)).not.toContain('board-status');
  });
});
