// The open epic an area's issues are filed under (#586). An epic holds at most 100 sub-issues, so each area's
// epic is rolled over to `Epic: <name> (n+1)` (docs/agents/issue-tracker.md → Epic rollover); scripts ask here
// instead of hardcoding an epic number. The pick is pure; the calls take `request` so tests can mock them.

/** GitHub's cap on sub-issues per parent. */
export const SUB_ISSUE_LIMIT = 100;

/** Title prefix of each area's epic. */
export const EPIC_NAMES = { infra: 'Epic: Infra & testing' } as const;
export type EpicArea = keyof typeof EPIC_NAMES;

export interface EpicIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  sub_issues_summary?: { total: number };
  pull_request?: unknown;
}

/** A GitHub REST call on this repo (`path` like `issues/12/labels`, no leading slash); throws on an error status. */
export type Request = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** The newest open issue labelled `epic` whose title starts with the area's epic name. */
export function pickEpic(issues: readonly EpicIssue[], area: EpicArea): EpicIssue | null {
  const name = EPIC_NAMES[area];
  const open = issues.filter(
    (i) => !i.pull_request && i.state === 'open' && i.title.startsWith(name) && i.labels.some((l) => l.name === 'epic'),
  );
  return open.sort((a, b) => b.number - a.number)[0] ?? null;
}

export async function currentEpic(request: Request, area: EpicArea): Promise<EpicIssue | null> {
  const issues = (await request('GET', 'issues?state=open&labels=epic&per_page=100')) as EpicIssue[];
  return pickEpic(issues, area);
}

/**
 * Files a new issue under the area's open epic. A missing or full epic, or a failed link, logs a `::warning::`
 * and leaves the issue without a parent: it never fails the run.
 */
export async function fileUnderEpic(
  request: Request,
  area: EpicArea,
  issue: { id: number; number: number },
): Promise<void> {
  try {
    const epic = await currentEpic(request, area);
    if (!epic) {
      console.log(`::warning::#${issue.number} has no parent: no open "${EPIC_NAMES[area]}" epic found.`);
    } else if ((epic.sub_issues_summary?.total ?? 0) >= SUB_ISSUE_LIMIT) {
      console.log(
        `::warning::#${issue.number} has no parent: epic #${epic.number} is full (${SUB_ISSUE_LIMIT} sub-issues). Roll it over (docs/agents/issue-tracker.md → Epic rollover).`,
      );
    } else {
      await request('POST', `issues/${epic.number}/sub_issues`, { sub_issue_id: issue.id });
    }
  } catch (error) {
    console.log(`::warning::#${issue.number} has no parent: filing it under the ${area} epic failed: ${String(error)}`);
  }
}
