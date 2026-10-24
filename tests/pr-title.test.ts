import { describe, expect, it } from 'vitest';
import { isConventionalTitle } from '../scripts/pr-title';

// The PR title becomes the squash commit, and its type drives the version bump (ADR-0004).
describe('isConventionalTitle', () => {
  it.each(['feat', 'fix', 'test', 'chore', 'docs', 'refactor', 'ci'])('accepts the %s type', (type) => {
    expect(isConventionalTitle(`${type}: add something`)).toBe(true);
  });

  it('accepts a scope and a breaking-change mark', () => {
    expect(isConventionalTitle('chore(main): release 0.1.0')).toBe(true);
    expect(isConventionalTitle('feat!: new save format')).toBe(true);
    expect(isConventionalTitle('fix(ui)!: reset settings')).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isConventionalTitle('feature: towers')).toBe(false);
    expect(isConventionalTitle('build: bump vite')).toBe(false);
  });

  it('rejects a missing description, a missing space after the colon, a capitalised type, or no type', () => {
    expect(isConventionalTitle('feat:')).toBe(false);
    expect(isConventionalTitle('feat:   ')).toBe(false);
    expect(isConventionalTitle('feat:towers')).toBe(false);
    expect(isConventionalTitle('Feat: towers')).toBe(false);
    expect(isConventionalTitle('Add towers')).toBe(false);
  });
});
