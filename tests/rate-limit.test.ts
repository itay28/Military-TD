import { describe, expect, it, vi } from 'vitest';
import { ApiMeter, rateLimitOf, softFail } from '../scripts/rate-limit.ts';

// The API meter and the soft fail on an exhausted quota (#293).
const NOW = new Date('2026-10-28T01:16:00Z');
const RESET = Math.floor(new Date('2026-10-28T01:45:00Z').getTime() / 1000);

const headers = (h: Record<string, string>) => new Headers(h);
const response = (status: number, body: string, h: Record<string, string> = {}) =>
  new Response(body, { status, headers: h });

describe('rateLimitOf', () => {
  it('reads a REST 403 with no requests left, and its reset time', () => {
    const limit = rateLimitOf(
      403,
      headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET), 'x-ratelimit-resource': 'core' }),
      '{"message":"API rate limit exceeded for user ID 36842310."}',
      NOW,
    );
    expect(limit).toEqual({ resource: 'core', reset: new Date('2026-10-28T01:45:00Z') });
  });

  it('reads a 429 with retry-after (a secondary limit) as a reset that many seconds from now', () => {
    expect(rateLimitOf(429, headers({ 'retry-after': '60' }), '', NOW)?.reset).toEqual(
      new Date('2026-10-28T01:17:00Z'),
    );
  });

  it('reads a GraphQL answer whose error is RATE_LIMITED, even with HTTP 200', () => {
    const body = JSON.stringify({
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit already exceeded for user ID 36842310.' }],
    });
    const limit = rateLimitOf(
      200,
      headers({ 'x-ratelimit-reset': String(RESET), 'x-ratelimit-resource': 'graphql' }),
      body,
      NOW,
    );
    expect(limit).toEqual({ resource: 'graphql', reset: new Date('2026-10-28T01:45:00Z') });
  });

  it('ignores other errors: a plain 403, a 404, a GraphQL error of another type', () => {
    expect(rateLimitOf(403, headers({ 'x-ratelimit-remaining': '4000' }), 'Resource not accessible', NOW)).toBe(
      undefined,
    );
    expect(rateLimitOf(404, headers({}), 'Not Found', NOW)).toBe(undefined);
    expect(rateLimitOf(200, headers({}), '{"errors":[{"type":"NOT_FOUND"}]}', NOW)).toBe(undefined);
    expect(rateLimitOf(200, headers({}), '{"data":{}}', NOW)).toBe(undefined);
  });

  it('has no reset time when the answer names none', () => {
    expect(rateLimitOf(403, headers({ 'x-ratelimit-remaining': '0' }), '', NOW)).toEqual({
      resource: 'core',
      reset: undefined,
    });
  });
});

describe('ApiMeter', () => {
  const quota = (resource: string, remaining: number) => ({
    'x-ratelimit-resource': resource,
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(RESET),
  });

  it('counts REST and GraphQL requests apart, and how far each quota fell', async () => {
    const answers = [
      response(200, '{}', quota('core', 4000)),
      response(200, '{}', quota('core', 3998)),
      response(200, '{"data":{}}', quota('graphql', 900)),
    ];
    const meter = new ApiMeter(() => NOW);
    const fetchFn = meter.wrap(async () => answers.shift()!);
    await fetchFn('https://api.github.com/repos/itay28/Military-TD/issues/1', {});
    await fetchFn('https://api.github.com/repos/itay28/Military-TD/issues/2', {});
    await fetchFn('https://api.github.com/graphql', {});
    expect(meter.requests).toEqual({ rest: 2, graphql: 1 });
    expect(meter.summary()).toBe(
      'GitHub API: 2 REST + 1 GraphQL requests. Quota left: core 3998/5000 (fell by 2 during the run), graphql 900/5000.',
    );
  });

  it("doesn't count requests to other hosts, such as a routine fire", async () => {
    const meter = new ApiMeter(() => NOW);
    await meter.wrap(async () => response(429, 'slow down'))('https://api.anthropic.com/v1/fire', {});
    expect(meter.requests).toEqual({ rest: 0, graphql: 0 });
    expect(meter.limited).toBe(undefined);
  });

  it('remembers a rate-limited answer, and sends no more GitHub requests after it', async () => {
    const meter = new ApiMeter(() => NOW);
    const inner = vi.fn(async () => response(403, '{"message":"API rate limit exceeded"}', { ...quota('core', 0) }));
    const fetchFn = meter.wrap(inner);
    const first = await fetchFn('https://api.github.com/repos/itay28/Military-TD/issues/1', {});
    expect(first.status).toBe(403);
    expect(await first.text()).toContain('rate limit');
    expect(meter.limited).toEqual({ resource: 'core', reset: new Date('2026-10-28T01:45:00Z') });
    await expect(fetchFn('https://api.github.com/graphql', {})).rejects.toThrow(/rate limit/);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('softFail', () => {
  it('after a rate-limited answer: logs the reset time as a warning and lets the run pass', () => {
    const meter = new ApiMeter(() => NOW);
    meter.limited = { resource: 'graphql', reset: new Date('2026-10-28T01:45:00Z') };
    const log = vi.fn();
    expect(softFail(meter, log)).toBe(true);
    expect(log).toHaveBeenCalledWith(
      '::warning::GitHub API rate limit (graphql) exhausted; it resets at 2026-10-28T01:45:00.000Z. ' +
        'This run stopped early; the next one catches up (#293).',
    );
  });

  it('without one: logs nothing, so the error still fails the run', () => {
    const log = vi.fn();
    expect(softFail(new ApiMeter(() => NOW), log)).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});
