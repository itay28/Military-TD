import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The board this repo's issues live on (docs/agents/issue-tracker.md → Project board). */
const OWNER = 'itay28';
const REPO = 'Military-TD';
const PROJECT_NUMBER = 4;

export type CardStatus = 'In review' | 'In progress';

export interface PullRequestState {
  readonly isDraft: boolean;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
}

// `gh` (or `...\gh.exe`, maybe quoted) then `pr ready|create`, at a word or path boundary.
const GH_PR = /(?:^|[\s"'\\/&])gh(?:\.exe)?["']?\s+pr\s+(ready|create)\b(.*)$/;

/**
 * Finds a `gh pr ready` (or a non-draft `gh pr create`) call in a shell command, which may be chained.
 * `pr` is the PR the call names, if any; without one it's the current branch's (or, for create, the output's).
 */
export function findPrCommand(command: string): { pr?: string } | undefined {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const match = GH_PR.exec(segment.trim());
    if (!match) continue;
    const [, subcommand, rest = ''] = match;
    const args = rest.trim().split(/\s+/).filter(Boolean);
    if (subcommand === 'create') {
      if (args.includes('--draft') || args.includes('-d')) continue;
      return {};
    }
    const pr = args.find((arg) => !arg.startsWith('-'));
    return pr ? { pr: pr.replace(/^["']|["']$/g, '') } : {};
  }
  return undefined;
}

/** The PR number in a `.../pull/<n>` URL, as `gh pr create` prints it. */
export function prFromOutput(text: string): string | undefined {
  return /\/pull\/(\d+)/.exec(text)?.[1];
}

/**
 * The Status a card should move to for its PR's state, or undefined to leave it:
 * an open PR ready for review → In review, a draft → In progress. Done and Backlog cards are never moved.
 */
export function targetStatus(pr: PullRequestState, current: string | undefined): CardStatus | undefined {
  if (pr.state !== 'OPEN' || current === 'Done' || current === 'Backlog') return undefined;
  const target: CardStatus = pr.isDraft ? 'In progress' : 'In review';
  return target === current ? undefined : target;
}

function readToken(): string | undefined {
  const fromEnv = process.env['GH_PROJECT_TOKEN']?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env['GH_PROJECT_TOKEN_FILE'] ?? join(homedir(), '.config', 'gh-project-token.txt');
  try {
    return readFileSync(file, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length || !body.data)
    throw new Error(body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${response.status}`);
  return body.data;
}

const PR_QUERY = `query($owner: String!, $name: String!, $number: Int!, $project: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      isDraft
      state
      closingIssuesReferences(first: 10) {
        nodes {
          number
          projectItems(first: 10) {
            nodes {
              id
              project { number }
              fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            }
          }
        }
      }
    }
  }
  user(login: $owner) {
    projectV2(number: $project) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
    }
  }
}`;

interface PrQueryData {
  repository: {
    pullRequest:
      | (PullRequestState & {
          closingIssuesReferences: {
            nodes: {
              number: number;
              projectItems: {
                nodes: { id: string; project: { number: number }; fieldValueByName: { name?: string } | null }[];
              };
            }[];
          };
        })
      | null;
  };
  user: { projectV2: { id: string; field: { id: string; options: { id: string; name: string }[] } } };
}

const SET_STATUS = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
    projectV2Item { id }
  }
}`;

/** Resolves the PR a hook call refers to: named in the command, printed by `gh pr create`, or the branch's open PR. */
async function resolvePr(token: string, named: string | undefined, output: string, cwd: string): Promise<number> {
  const fromName = named && (prFromOutput(named) ?? (/^\d+$/.test(named) ? named : undefined));
  const number = fromName ?? prFromOutput(output);
  if (number) return Number(number);
  const branch = named ?? execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  const data = await graphql<{ repository: { pullRequests: { nodes: { number: number }[] } } }>(
    token,
    `
      query ($owner: String!, $name: String!, $branch: String!) {
        repository(owner: $owner, name: $name) {
          pullRequests(headRefName: $branch, states: OPEN, first: 1) {
            nodes {
              number
            }
          }
        }
      }
    `,
    { owner: OWNER, name: REPO, branch },
  );
  const pr = data.repository.pullRequests.nodes[0];
  if (!pr) throw new Error(`no open PR for branch ${branch}`);
  return pr.number;
}

/** Moves each card of the issues `pr` closes to the Status its draft state calls for. Returns one line per issue. */
async function syncCards(token: string, pr: number): Promise<string[]> {
  const data = await graphql<PrQueryData>(token, PR_QUERY, {
    owner: OWNER,
    name: REPO,
    number: pr,
    project: PROJECT_NUMBER,
  });
  const pull = data.repository.pullRequest;
  if (!pull) throw new Error(`PR #${pr} not found`);
  const { id: projectId, field } = data.user.projectV2;
  const lines: string[] = [];
  for (const issue of pull.closingIssuesReferences.nodes) {
    const card = issue.projectItems.nodes.find((item) => item.project.number === PROJECT_NUMBER);
    const current = card?.fieldValueByName?.name;
    const target = targetStatus(pull, current);
    if (!card || !target) {
      lines.push(`#${issue.number}: left at ${current ?? 'no card'}`);
      continue;
    }
    const option = field.options.find((o) => o.name === target);
    if (!option) throw new Error(`no "${target}" option on the Status field`);
    await graphql(token, SET_STATUS, { project: projectId, item: card.id, field: field.id, option: option.id });
    lines.push(`#${issue.number}: ${current ?? 'no status'} → ${target}`);
  }
  return lines.length ? lines : [`PR #${pr} closes no issue: add "Closes #n" to its body`];
}

interface HookInput {
  tool_input?: { command?: string };
  tool_response?: unknown;
  cwd?: string;
}

/** Tells the agent what happened, as PostToolUse additional context. */
function report(message: string): void {
  const context = `board-status hook: ${message}`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } }));
}

// Hook entry point: `node scripts/board-status.ts`, run by .claude/settings.json after each Bash/PowerShell call.
// Exits 0 whatever happens: it never blocks the agent, only reports.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let call: { pr?: string } | undefined;
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as HookInput;
    call = findPrCommand(input.tool_input?.command ?? '');
    const token = call && readToken();
    if (call && !token) {
      report(
        'no project token (GH_PROJECT_TOKEN, GH_PROJECT_TOKEN_FILE or ~/.config/gh-project-token.txt), so the card was not moved. Move it by hand.',
      );
    } else if (call && token) {
      const output = JSON.stringify(input.tool_response ?? '');
      const pr = await resolvePr(token, call.pr, output, input.cwd ?? process.cwd());
      report(`PR #${pr}: ${(await syncCards(token, pr)).join('; ')}`);
    }
  } catch (error) {
    // Unreadable input on an unrelated call stays silent; a PR call says what went wrong.
    if (call) report(`could not sync the board (${(error as Error).message}). Move the card by hand.`);
  }
}
