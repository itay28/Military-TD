import { describe, expect, it } from 'vitest';
import { checkTitle, FREEZE_EXCEPTION_LABEL, isConventionalTitle, isFeatureFreeze } from '../scripts/pr-title';

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

// The feature freeze (#84): while FEATURE_FREEZE is `true`, `feat` PRs don't merge unless labelled freeze-exception.
describe('isFeatureFreeze', () => {
  it.each(['true', 'TRUE', ' true '])('is on for %j', (value) => {
    expect(isFeatureFreeze(value)).toBe(true);
  });

  it.each([undefined, '', 'false', 'off', 'on', '1'])('is off for %j', (value) => {
    expect(isFeatureFreeze(value)).toBe(false);
  });
});

describe('checkTitle', () => {
  const on = { freeze: true, labels: [] };
  const off = { freeze: false, labels: [] };

  it('accepts feat titles while the freeze is off', () => {
    expect(checkTitle('feat: towers', off).ok).toBe(true);
  });

  it.each(['feat: towers', 'feat(ui): a panel', 'feat!: new save format'])(
    'rejects %j while the freeze is on',
    (title) => {
      const result = checkTitle(title, on);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('feature freeze');
      expect(result.message).toContain('FEATURE_FREEZE');
      expect(result.message).toContain(FREEZE_EXCEPTION_LABEL);
    },
  );

  it('lets a feat title through with the freeze-exception label', () => {
    expect(FREEZE_EXCEPTION_LABEL).toBe('freeze-exception');
    expect(checkTitle('feat: towers', { freeze: true, labels: ['area:ui', 'freeze-exception'] }).ok).toBe(true);
  });

  it.each(['fix', 'test', 'docs', 'chore', 'refactor', 'ci'])('accepts %s titles while the freeze is on', (type) => {
    expect(checkTitle(`${type}: something`, on).ok).toBe(true);
  });

  it('still rejects a title that is not a Conventional Commit, freeze or not', () => {
    for (const options of [on, off]) {
      const result = checkTitle('Add towers', options);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not a Conventional Commit');
    }
  });
});
