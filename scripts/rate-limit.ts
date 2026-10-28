// Counts the GitHub API requests a run makes and fails soft when the quota runs out (#293).
// Board sync and PR steward share the maintainer's PROJECT_TOKEN quota with every other
// workflow that uses it, so each run logs what it spent (`ApiMeter.summary`) and, once GitHub
// says the quota is gone, stops sending requests and exits green (`softFail`): the next
// scheduled run catches up, as auto-start does for refused routine fires (#200).

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const API_HOST = 'api.github.com';

/** A rate-limited answer: which quota ran out, and when it comes back (when GitHub says). */
export interface RateLimit {
  readonly resource: string;
  readonly reset: Date | undefined;
}

/**
 * Whether an answer means a rate limit: a 403 or 429 with no requests left, a `retry-after`
 * (a secondary limit) or a "rate limit" message, or a GraphQL `RATE_LIMITED` error (sent with
 * HTTP 200). Any other error is the caller's to handle.
 */
export function rateLimitOf(status: number, headers: Headers, body: string, now: Date): RateLimit | undefined {
  const limited =
    status === 403 || status === 429
      ? headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after') || /rate limit/i.test(body)
      : graphqlRateLimited(body);
  if (!limited) return undefined;
  const retryAfter = Number(headers.get('retry-after') ?? NaN);
  const resetAt = Number(headers.get('x-ratelimit-reset') ?? NaN);
  const reset = Number.isFinite(retryAfter)
    ? new Date(now.getTime() + retryAfter * 1000)
    : Number.isFinite(resetAt)
      ? new Date(resetAt * 1000)
      : undefined;
  return { resource: headers.get('x-ratelimit-resource') ?? 'core', reset };
}

function graphqlRateLimited(body: string): boolean {
  if (!body.includes('RATE_LIMITED')) return false;
  try {
    const { errors } = JSON.parse(body) as { errors?: { type?: string }[] };
    return errors?.some((e) => e.type === 'RATE_LIMITED') ?? false;
  } catch {
    return false;
  }
}

interface Quota {
  readonly limit: number;
  readonly first: number;
  readonly last: number;
}

/** Wraps `fetch` to count a run's GitHub requests and watch the rate-limit headers. */
export class ApiMeter {
  readonly requests = { rest: 0, graphql: 0 };
  /** The first rate-limited answer; set, every later GitHub request throws without being sent. */
  limited: RateLimit | undefined;
  private readonly quotas = new Map<string, Quota>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  wrap(fetchFn: Fetch): Fetch {
    return async (url, init) => {
      const host = new URL(url).host;
      if (host !== API_HOST) return fetchFn(url, init);
      if (this.limited) throw new Error(`GitHub API rate limit (${this.limited.resource}) exhausted, ${url} not sent.`);
      const graphql = new URL(url).pathname === '/graphql';
      this.requests[graphql ? 'graphql' : 'rest']++;
      const response = await fetchFn(url, init);
      this.record(response.headers);
      if (graphql || response.status === 403 || response.status === 429)
        this.limited ??= rateLimitOf(response.status, response.headers, await response.clone().text(), this.now());
      return response;
    };
  }

  private record(headers: Headers): void {
    const resource = headers.get('x-ratelimit-resource');
    const remaining = Number(headers.get('x-ratelimit-remaining') ?? NaN);
    const limit = Number(headers.get('x-ratelimit-limit') ?? NaN);
    if (!resource || !Number.isFinite(remaining)) return;
    const seen = this.quotas.get(resource);
    this.quotas.set(resource, { limit, first: seen?.first ?? remaining, last: remaining });
  }

  /** One log line: requests sent, and what each quota had left at the end. */
  summary(): string {
    const quotas = [...this.quotas].map(([resource, q]) => {
      const fell = q.first - q.last;
      return `${resource} ${q.last}/${q.limit}${fell > 0 ? ` (fell by ${fell} during the run)` : ''}`;
    });
    return (
      `GitHub API: ${this.requests.rest} REST + ${this.requests.graphql} GraphQL requests.` +
      (quotas.length ? ` Quota left: ${quotas.join(', ')}.` : '')
    );
  }
}

/**
 * For the CLI's catch: true (and a warning with the reset time) when the run hit the rate limit,
 * so it exits green instead of failing; false for any other error.
 */
export function softFail(meter: ApiMeter, log: (line: string) => void = console.log): boolean {
  if (!meter.limited) return false;
  const reset = meter.limited.reset ? `it resets at ${meter.limited.reset.toISOString()}` : 'no reset time given';
  log(
    `::warning::GitHub API rate limit (${meter.limited.resource}) exhausted; ${reset}. ` +
      'This run stopped early; the next one catches up (#293).',
  );
  return true;
}
