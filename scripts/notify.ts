import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Phone pushes to the maintainer through ntfy (#169, docs/agents/issue-tracker.md → Hand-off): a new release,
// a PR the steward gave up on (`needs-you`), and an agent's question (`needs-info`). The decisions and messages
// are pure functions; the CLI at the bottom only fetches and sends.

/** One ntfy message. `title` and `click` go in headers, so they must stay ASCII. */
export interface Push {
  title: string;
  body: string;
  click: string;
}

/** A PR or issue to push about. */
export interface Item {
  number: number;
  title: string;
  url: string;
}

/** The PR steward (#168) starts its summary comment with this marker before labelling a PR `needs-you`. */
export const STUCK_MARKER = '<!-- pr-steward:stuck -->';
/** Auto-start (scripts/auto-start.ts) starts its comment with this before labelling an issue `needs-you` (#200). */
export const HANDOFF_MARKER = '<!-- auto-start:stuck -->';

// ntfy turns messages over 4096 bytes into attachments; stay under that.
const MAX_BODY_BYTES = 4000;

export function releaseMessage(tag: string, repoUrl: string): Push {
  return {
    title: `Military-TD ${tag} released`,
    body: `Changelog: ${repoUrl}/blob/${tag}/CHANGELOG.md`,
    click: `${repoUrl}/releases/tag/${tag}`,
  };
}

export function stuckPrMessage(pr: Item, summary: string | null): Push {
  return { title: `PR #${pr.number} is stuck`, body: fit(summary ?? pr.title), click: pr.url };
}

export function stuckIssueMessage(issue: Item, summary: string | null): Push {
  return { title: `Issue #${issue.number} needs you`, body: fit(summary ?? issue.title), click: issue.url };
}

export function questionMessage(issue: Item): Push {
  return { title: `Question on #${issue.number}`, body: fit(issue.title), click: issue.url };
}

/** Cuts text to MAX_BODY_BYTES of UTF-8, ending with an ellipsis when cut. */
function fit(text: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= MAX_BODY_BYTES) return text;
  let out = '';
  let bytes = encoder.encode('…').length;
  for (const char of text) {
    bytes += encoder.encode(char).length;
    if (bytes > MAX_BODY_BYTES) break;
    out += char;
  }
  return `${out}…`;
}

interface Labelled {
  number: number;
  labels?: { name: string }[];
  pull_request?: unknown;
}

/** The subset of a `pull_request` / `issues` webhook payload this reads. */
export interface LabelEvent {
  action?: string;
  label?: { name: string };
  pull_request?: Labelled;
  issue?: Labelled;
}

export type Target = { kind: 'pr' | 'issue' | 'stuck-issue'; number: number };

/** What a label event pushes about: `needs-you` on a PR or an issue, `needs-info` on an issue, nothing on `hold`. */
export function pushFor(eventName: string, event: LabelEvent): Target | null {
  if (event.action !== 'labeled') return null;
  const onHold = (item: Labelled) => (item.labels ?? []).some((l) => l.name === 'hold');
  const label = event.label?.name;
  if (eventName === 'pull_request' && label === 'needs-you' && event.pull_request) {
    return onHold(event.pull_request) ? null : { kind: 'pr', number: event.pull_request.number };
  }
  // Labelling a PR sends a pull_request event, but an issue payload can still carry pull_request; skip those.
  if (eventName === 'issues' && event.issue && !event.issue.pull_request) {
    const kind = label === 'needs-info' ? 'issue' : label === 'needs-you' ? 'stuck-issue' : null;
    return kind && !onHold(event.issue) ? { kind, number: event.issue.number } : null;
  }
  return null;
}

/** The latest hand-off summary among a PR's or issue's comments (oldest first), without its marker. */
export function stewardSummary(comments: { body?: string | null }[]): string | null {
  const markers = [STUCK_MARKER, HANDOFF_MARKER];
  const latest = comments.findLast((c) => markers.some((m) => c.body?.includes(m)));
  return latest?.body ? markers.reduce((body, m) => body.replace(m, ''), latest.body).trim() : null;
}

/** The pages to fetch for a PR's latest comments: the last one and the one before, since the steward posts
 * its summary right before the label. */
export function lastCommentPages(comments: number, perPage: number): number[] {
  const last = Math.max(1, Math.ceil(comments / perPage));
  return last > 1 ? [last - 1, last] : [last];
}

/** Posts a push to the ntfy topic. Fails loudly without a topic or on an error response. */
export async function send(topic: string | undefined, push: Push, fetcher: typeof fetch = fetch): Promise<void> {
  if (!topic) throw new Error('NTFY_TOPIC is not set: add the repo secret (docs/agents/issue-tracker.md → Hand-off).');
  const res = await fetcher(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: { Title: push.title, Click: push.click, Tags: 'military-td' },
    body: push.body,
  });
  if (!res.ok) throw new Error(`ntfy: ${res.status} ${await res.text()}`);
}

// --- CLI -------------------------------------------------------------------
// `node scripts/notify.ts release <tag>`: run by the notify job in release-please.yml.
// `node scripts/notify.ts event`: run by .github/workflows/notify.yml on a label event.
// `node scripts/notify.ts pr <n>` / `issue <n>`: push directly, e.g. from a workflow whose labels come from
// GITHUB_TOKEN (those don't start notify.yml).

const API = 'https://api.github.com';
const repoPath = process.env['GITHUB_REPOSITORY'] ?? 'itay28/Military-TD';
const repoUrl = `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${repoPath}`;

async function get<T>(path: string): Promise<T> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  const res = await fetch(`${API}/repos/${repoPath}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface ApiIssue {
  number: number;
  title: string;
  html_url: string;
  comments: number;
}

async function pushStuck(number: number, message: typeof stuckPrMessage): Promise<Push> {
  const item = await get<ApiIssue>(`/issues/${number}`);
  const pages = lastCommentPages(item.comments, 100);
  const comments = (
    await Promise.all(
      pages.map((p) => get<{ body?: string | null }[]>(`/issues/${number}/comments?per_page=100&page=${p}`)),
    )
  ).flat();
  return message({ number, title: item.title, url: item.html_url }, stewardSummary(comments));
}

const pushPr = (number: number) => pushStuck(number, stuckPrMessage);

async function pushIssue(number: number): Promise<Push> {
  const issue = await get<ApiIssue>(`/issues/${number}`);
  return questionMessage({ number, title: issue.title, url: issue.html_url });
}

async function pushEvent(): Promise<Push | null> {
  const path = process.env['GITHUB_EVENT_PATH'];
  if (!path) throw new Error('GITHUB_EVENT_PATH is not set.');
  const target = pushFor(process.env['GITHUB_EVENT_NAME'] ?? '', JSON.parse(readFileSync(path, 'utf8')) as LabelEvent);
  if (!target) return null;
  if (target.kind === 'stuck-issue') return pushStuck(target.number, stuckIssueMessage);
  return target.kind === 'pr' ? pushPr(target.number) : pushIssue(target.number);
}

async function pushOf(mode: string | undefined, arg: string): Promise<Push | null> {
  if (mode === 'release' && arg) return releaseMessage(arg, repoUrl);
  if (mode === 'pr' && /^\d+$/.test(arg)) return pushPr(Number(arg));
  if (mode === 'issue' && /^\d+$/.test(arg)) return pushIssue(Number(arg));
  if (mode === 'event') return pushEvent();
  throw new Error('Usage: node scripts/notify.ts release <tag> | pr <n> | issue <n> | event');
}

async function main(mode: string | undefined, arg: string): Promise<void> {
  const push = await pushOf(mode, arg);
  if (!push) {
    console.log('Nothing to push for this event.');
    return;
  }
  console.log(`Pushing: ${push.title} → ${push.click}`);
  await send(process.env['NTFY_TOPIC'], push);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, arg = ''] = process.argv.slice(2);
  main(mode, arg).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
