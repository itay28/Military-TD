import { describe, expect, it } from 'vitest';
import {
  commentFor,
  currentMilestone,
  decide,
  issueBody,
  issueTitle,
  markerFor,
  pushFor,
  type Run,
} from '../scripts/failure-report.ts';

const run = (over: Partial<Run> = {}): Run => ({
  workflow: 'CI',
  conclusion: 'failure',
  branch: 'main',
  url: 'https://github.com/itay28/Military-TD/actions/runs/1',
  sha: 'abcdef1234567890',
  commitTitle: 'feat: add mortar',
  failedJobs: ['ci', 'e2e'],
  ...over,
});

describe('decide', () => {
  it('opens an issue when a watched workflow fails and no report is open', () => {
    expect(decide(run(), null)).toEqual({ action: 'open' });
  });

  it('comments on the open report instead of opening another', () => {
    expect(decide(run(), { number: 5 })).toEqual({ action: 'comment', issue: 5, kind: 'failure' });
  });

  it('comments that it is green again on success with an open report', () => {
    expect(decide(run({ conclusion: 'success' }), { number: 5 })).toEqual({
      action: 'comment',
      issue: 5,
      kind: 'green',
    });
  });

  it('does nothing on success with no open report', () => {
    expect(decide(run({ conclusion: 'success' }), null)).toBeNull();
  });

  it('ignores CI on branches other than main, even failing ones', () => {
    expect(decide(run({ branch: 'feat/1-x' }), null)).toBeNull();
    expect(decide(run({ branch: 'feat/1-x', conclusion: 'success' }), { number: 5 })).toBeNull();
  });

  it('ignores cancelled and skipped runs', () => {
    expect(decide(run({ conclusion: 'cancelled' }), { number: 5 })).toBeNull();
    expect(decide(run({ conclusion: 'skipped' }), null)).toBeNull();
  });

  it('ignores workflows it does not watch', () => {
    expect(decide(run({ workflow: 'Notify' }), null)).toBeNull();
  });

  it('watches Release on main and Deploy on any ref (its tag)', () => {
    expect(decide(run({ workflow: 'Release' }), null)).toEqual({ action: 'open' });
    expect(decide(run({ workflow: 'Release', branch: 'other' }), null)).toBeNull();
    expect(decide(run({ workflow: 'Deploy', branch: 'v0.2.0' }), null)).toEqual({ action: 'open' });
  });
});

describe('texts', () => {
  it('titles name the workflow and main, or the tag for Deploy', () => {
    expect(issueTitle(run())).toBe('fix: CI failing on main');
    expect(issueTitle(run({ workflow: 'Release' }))).toBe('fix: Release failing on main');
    expect(issueTitle(run({ workflow: 'Deploy', branch: 'v0.2.0' }))).toBe('fix: Deploy failing for v0.2.0');
  });

  it('the body carries the marker, run link, failed jobs and head commit', () => {
    const body = issueBody(run());
    expect(body).toContain(markerFor('CI'));
    expect(body).toContain('https://github.com/itay28/Military-TD/actions/runs/1');
    expect(body).toContain('`ci`');
    expect(body).toContain('`e2e`');
    expect(body).toContain('abcdef1');
    expect(body).toContain('feat: add mortar');
  });

  it('markers differ per workflow', () => {
    expect(markerFor('CI')).toBe('<!-- failure-report:CI -->');
    expect(markerFor('Deploy')).not.toBe(markerFor('CI'));
  });

  it('comments link the new run, or say it is green again', () => {
    expect(commentFor(run(), 'failure')).toContain('actions/runs/1');
    expect(commentFor(run({ conclusion: 'success' }), 'green')).toMatch(/green again/i);
  });

  it('the push names the workflow and clicks through to the issue', () => {
    const push = pushFor(run(), { number: 9, url: 'https://github.com/x/y/issues/9' });
    expect(push.title).toContain('CI');
    expect(push.click).toBe('https://github.com/x/y/issues/9');
  });
});

describe('currentMilestone', () => {
  it('picks the open milestone due first, then the lowest title', () => {
    const ms = [
      { number: 3, title: 'v0.3.0', state: 'open', due_on: null },
      { number: 2, title: 'v0.2.0', state: 'open', due_on: null },
      { number: 1, title: 'v0.1.0', state: 'closed', due_on: null },
    ];
    expect(currentMilestone(ms)).toBe(2);
    expect(currentMilestone([{ number: 4, title: 'v9', state: 'open', due_on: '2026-01-01T00:00:00Z' }, ...ms])).toBe(
      4,
    );
    expect(currentMilestone([])).toBeNull();
  });
});
