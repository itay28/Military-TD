import { pathToFileURL } from 'node:url';

// A missing dependency is a native "blocked by" link, not a needs-info question (#538). The agent
// adds the link itself; when its call is denied it comments `<!-- blocked-by: #459 #460 -->` and
// .github/workflows/blocked-links.yml runs this to add what's missing (like split-links.ts, #488).
// Idempotent: a re-run never adds a link twice.

export interface BlockApi {
  issueId(issue: number): Promise<number>;
  /** Numbers of the issues blocking this one. */
  blockedBy(issue: number): Promise<number[]>;
  addBlockedBy(issue: number, blockerId: number): Promise<void>;
}

export interface Problem {
  issue: number;
  message: string;
}

export interface LinkResult {
  added: string[];
  problems: Problem[];
}

const MARKER = /<!--\s*blocked-by:([^>]*?)-->/gi;

/** The blocker numbers named by `blocked-by` markers in a comment: distinct, in order, never the issue itself. */
export function parseBlockedMarker(body: string, issue: number): number[] {
  const found: number[] = [];
  for (const marker of body.matchAll(MARKER)) {
    for (const ref of (marker[1] ?? '').matchAll(/#(\d+)\b/g)) {
      const n = Number(ref[1]);
      if (n > 0 && n !== issue && !found.includes(n)) found.push(n);
    }
  }
  return found;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Adds the missing links, then reads them back; never throws on an API error, it reports it. */
export async function linkBlockers(issue: number, blockers: number[], api: BlockApi): Promise<LinkResult> {
  const added: string[] = [];
  const problems: Problem[] = [];
  const fail = (message: string) => problems.push({ issue, message });
  const failed = new Set<number>();

  for (const blocker of blockers) {
    try {
      if (!(await api.blockedBy(issue)).includes(blocker)) {
        await api.addBlockedBy(issue, await api.issueId(blocker));
        added.push(`#${issue} blocked by #${blocker}`);
      }
    } catch (error) {
      failed.add(blocker);
      fail(`marking it blocked by #${blocker} failed: ${reason(error)}`);
    }
  }
  // Read back: the links are what counts, not the calls' answers.
  try {
    const now = await api.blockedBy(issue);
    for (const blocker of blockers)
      if (!now.includes(blocker) && !failed.has(blocker)) fail(`not blocked by #${blocker}`);
  } catch (error) {
    fail(`reading what blocks it failed: ${reason(error)}`);
  }
  return { added, problems };
}

// --- CLI -------------------------------------------------------------------
// `ISSUE=364 COMMENT_BODY=... node scripts/blocked-links.ts`, with GITHUB_TOKEN.

const repoPath = process.env['GITHUB_REPOSITORY'] ?? 'itay28/Military-TD';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  const res = await fetch(`https://api.github.com/repos/${repoPath}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const restApi: BlockApi = {
  issueId: async (issue) => (await call<{ id: number }>('GET', `/issues/${issue}`)).id,
  blockedBy: async (issue) =>
    (await call<{ number: number }[]>('GET', `/issues/${issue}/dependencies/blocked_by?per_page=100`)).map(
      (i) => i.number,
    ),
  addBlockedBy: async (issue, id) =>
    void (await call('POST', `/issues/${issue}/dependencies/blocked_by`, { issue_id: id })),
};

async function main(): Promise<void> {
  const issue = Number(process.env['ISSUE']);
  const blockers = parseBlockedMarker(process.env['COMMENT_BODY'] ?? '', issue);
  if (!Number.isInteger(issue) || issue <= 0 || !blockers.length) {
    console.log('No blocked-by marker.');
    return;
  }
  const { added, problems } = await linkBlockers(issue, blockers, restApi);
  console.log(added.length ? `Linked: ${added.join(', ')}.` : 'Every link was already there.');
  for (const p of problems) console.log(`::error::#${p.issue}: ${p.message}`);
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(reason(error));
    process.exitCode = 1;
  });
}
