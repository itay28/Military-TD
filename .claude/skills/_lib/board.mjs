// Shared helpers for the board skills (promote-ready, spawn-sessions).
// Calls gh with execFileSync so arguments reach it as-is (PowerShell 5.1 mangles quotes).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const OWNER = 'itay28';
export const REPO = 'Military-TD';
export const PROJECT_NUMBER = 4;

const GH_FALLBACK = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const gh = existsSync(GH_FALLBACK) ? GH_FALLBACK : 'gh';

// The repo's gh login can't edit user-owned Projects; board calls need the classic token.
function projectToken() {
  if (process.env.GH_PROJECT_TOKEN) return process.env.GH_PROJECT_TOKEN.trim();
  const candidates = [
    process.env.GH_PROJECT_TOKEN_FILE,
    join(homedir(), '.config', 'gh-project-token.txt'),
    join(homedir(), '.config', 'gh-project-token.txt.txt'),
  ].filter(Boolean);
  for (const file of candidates) if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error(
    'No classic project token. Set GH_PROJECT_TOKEN or GH_PROJECT_TOKEN_FILE ' +
      '(classic PAT with project + repo scopes; see docs/agents/issue-tracker.md).',
  );
}

function run(args, env = {}) {
  return execFileSync(gh, args, { encoding: 'utf8', env: { ...process.env, ...env } });
}

function graphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(variables)) args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
  const res = JSON.parse(run(args, { GH_TOKEN: projectToken() }));
  if (res.errors) throw new Error(JSON.stringify(res.errors));
  return res.data;
}

/** Parses the `--flag value` / `--flag` arguments of a skill script. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

/** Open milestones, oldest first: by due date when set, otherwise by the version in the title. */
export function openMilestones() {
  const list = JSON.parse(run(['api', `repos/${OWNER}/${REPO}/milestones?state=open&per_page=100`]));
  const version = (t) => (t.match(/v?(\d+)\.(\d+)\.(\d+)/) || [0, 999, 999, 999]).slice(1).map(Number);
  return list.sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on || b.due_on) return a.due_on ? -1 : 1;
    const [va, vb] = [version(a.title), version(b.title)];
    return va[0] - vb[0] || va[1] - vb[1] || va[2] - vb[2];
  });
}

/**
 * Resolves a milestone argument: undefined → the current (oldest open) milestone;
 * otherwise a milestone number, exact title, or title prefix such as "v0.2".
 */
export function resolveMilestone(arg) {
  const open = openMilestones();
  if (!open.length) throw new Error('No open milestones.');
  if (arg === undefined || arg === true) return open[0];
  const s = String(arg).trim();
  const match =
    open.find((m) => String(m.number) === s) ||
    open.find((m) => m.title === s) ||
    open.find((m) => m.title.toLowerCase().startsWith(s.toLowerCase()));
  if (!match) throw new Error(`No open milestone matches "${s}". Open: ${open.map((m) => m.title).join(', ')}`);
  return match;
}

/** The project id, Status field id and its option ids by name. */
export function statusField() {
  const data = graphql(
    `query($owner:String!,$number:Int!){ user(login:$owner){ projectV2(number:$number){ id
      field(name:"Status"){ ... on ProjectV2SingleSelectField { id options { id name } } } } } }`,
    { owner: OWNER, number: PROJECT_NUMBER },
  );
  const p = data.user.projectV2;
  return { projectId: p.id, fieldId: p.field.id, options: Object.fromEntries(p.field.options.map((o) => [o.name, o.id])) };
}

/** Every issue on the board from this repo, with its board Status. */
export function boardIssues() {
  const items = [];
  let after = null;
  do {
    const data = graphql(
      `query($owner:String!,$number:Int!,$after:String){ user(login:$owner){ projectV2(number:$number){
        items(first:100, after:$after){ pageInfo { hasNextPage endCursor } nodes { id
          status: fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content { ... on Issue { number title url state repository { nameWithOwner }
            milestone { number title } assignees(first:10){ nodes { login } }
            labels(first:30){ nodes { name } } issueDependenciesSummary { blockedBy } } } } } } } }`,
      { owner: OWNER, number: PROJECT_NUMBER, ...(after ? { after } : {}) },
    );
    const page = data.user.projectV2.items;
    for (const n of page.nodes) {
      const c = n.content;
      if (!c || c.number === undefined || c.repository.nameWithOwner !== `${OWNER}/${REPO}`) continue;
      items.push({
        itemId: n.id,
        status: n.status?.name ?? null,
        number: c.number,
        title: c.title,
        url: c.url,
        state: c.state,
        milestone: c.milestone,
        assignees: c.assignees.nodes.map((a) => a.login),
        labels: c.labels.nodes.map((l) => l.name),
        openBlockers: c.issueDependenciesSummary?.blockedBy ?? 0,
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return items.sort((a, b) => a.number - b.number);
}

/** Sets an item's Status to the named option. */
export function setStatus(field, itemId, statusName) {
  const optionId = field.options[statusName];
  if (!optionId) throw new Error(`Board has no "${statusName}" status.`);
  graphql(
    `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{
      projectId:$p, itemId:$i, fieldId:$f, value:{ singleSelectOptionId:$o } }){ projectV2Item { id } } }`,
    { p: field.projectId, i: itemId, f: field.fieldId, o: optionId },
  );
}
