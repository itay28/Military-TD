// Sets Priority and Size on the Military-TD Roadmap board (users/itay28/projects/4).
// Run from anywhere: node set-size-priority.mjs        (add --dry-run to only print)
// Token: GH_PROJECT_TOKEN, the file named by GH_PROJECT_TOKEN_FILE, or ~/.config/gh-project-token.txt
// (classic token with `project` and `repo` scopes, as in docs/agents/issue-tracker.md).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// issue number: [Priority, Size]. Epics and release trackers are left without values on purpose.
const PLAN = {
  // v0.1.0 MVP
  26: ['P1', 'L'],
  // v0.2.0 Combat depth
  16: ['P1', 'M'], 28: ['P1', 'M'], 29: ['P1', 'M'], 30: ['P1', 'S'], 31: ['P1', 'M'],
  32: ['P1', 'S'], 33: ['P1', 'S'], 34: ['P1', 'S'], 35: ['P1', 'M'], 36: ['P1', 'M'],
  52: ['P1', 'M'], 53: ['P1', 'S'], 54: ['P1', 'M'], 55: ['P1', 'M'], 56: ['P1', 'S'],
  // v0.3.0 Game shell
  46: ['P1', 'M'], 47: ['P1', 'M'], 48: ['P1', 'M'], 49: ['P1', 'S'], 50: ['P2', 'S'],
  51: ['P1', 'M'], 57: ['P1', 'M'],
  // v0.4.0 Art & map pipeline
  39: ['P1', 'M'], 40: ['P1', 'M'], 41: ['P1', 'M'], 42: ['P1', 'M'], 43: ['P1', 'M'],
  44: ['P2', 'M'], 58: ['P1', 'L'], 59: ['P1', 'M'], 60: ['P2', 'S'], 61: ['P1', 'S'],
  // v0.5.0 Maps & progression
  37: ['P1', 'M'], 62: ['P1', 'L'], 63: ['P1', 'M'], 64: ['P1', 'M'], 65: ['P1', 'M'],
  // v0.6.0 Audio
  45: ['P1', 'M'], 66: ['P1', 'M'], 67: ['P1', 'S'],
  // v0.7.0 Polish & accessibility
  68: ['P2', 'M'], 69: ['P2', 'M'], 70: ['P2', 'S'], 71: ['P1', 'L'], 72: ['P1', 'M'], 73: ['P1', 'M'],
  // v0.8.0 Content & bosses
  74: ['P1', 'M'], 75: ['P1', 'M'], 76: ['P1', 'M'], 77: ['P1', 'S'], 78: ['P1', 'S'],
  79: ['P1', 'S'], 80: ['P1', 'M'], 81: ['P3', 'M'],
  // v0.9.0 Beta
  82: ['P1', 'S'], 83: ['P1', 'M'], 84: ['P1', 'L'],
  // v1.0.0 Release
  85: ['P1', 'M'],
};

const DRY = process.argv.includes('--dry-run');
process.on('uncaughtException', (e) => { console.log('::error::' + String(e?.message ?? e).slice(0, 900)); process.exit(1); });
const lines = [];
const log = (m) => { console.log(m); lines.push(m); };

function readToken() {
  const env = process.env.GH_PROJECT_TOKEN?.trim();
  if (env) return env;
  const file = process.env.GH_PROJECT_TOKEN_FILE ?? join(homedir(), '.config', 'gh-project-token.txt');
  try { return readFileSync(file, 'utf8').trim(); } catch { return ''; }
}
const token = readToken();
if (!token) { console.log("::error::" + 'No project token found (GH_PROJECT_TOKEN or ~/.config/gh-project-token.txt).'); process.exit(1); }

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const fieldsData = await gql(`query { user(login: "itay28") { projectV2(number: 4) { id
  fields(first: 50) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`);
const project = fieldsData.user.projectV2;
const field = (name) => {
  const f = project.fields.nodes.find((n) => n?.name?.toLowerCase() === name.toLowerCase());
  if (!f) throw new Error(`No single-select field "${name}" on the board`);
  return f;
};
const priority = field('Priority');
const size = field('Size');
const option = (f, name) => {
  const o = f.options.find((x) => x.name === name || x.name.startsWith(name + ' ') || x.name.startsWith(name + ':'));
  if (!o) throw new Error(`Field ${f.name} has no option "${name}" (has: ${f.options.map((x) => x.name).join(', ')})`);
  return o;
};

// Map issue number -> { item id, current values }
const items = new Map();
let cursor = null;
do {
  const d = await gql(`query($id: ID!, $after: String) { node(id: $id) { ... on ProjectV2 {
    items(first: 100, after: $after) { pageInfo { hasNextPage endCursor }
      nodes { id content { ... on Issue { number repository { name } } }
        fieldValues(first: 20) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { id } } } } } } } } } }`,
    { id: project.id, after: cursor });
  const page = d.node.items;
  for (const it of page.nodes) {
    if (!it.content?.number || it.content.repository.name.toLowerCase() !== 'military-td') continue;
    const cur = {};
    for (const v of it.fieldValues.nodes) if (v?.field?.id) cur[v.field.id] = v.name;
    items.set(it.content.number, { id: it.id, cur });
  }
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);

const SET = `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } } }`;

let changed = 0, same = 0;
for (const [num, [p, s]] of Object.entries(PLAN)) {
  const item = items.get(Number(num));
  if (!item) { log(`#${num}: not on the board, skipped`); continue; }
  for (const [f, want] of [[priority, p], [size, s]]) {
    const opt = option(f, want);
    if (item.cur[f.id] === opt.name) { same++; continue; }
    log(`#${num} ${f.name}: ${item.cur[f.id] ?? '(empty)'} -> ${opt.name}`);
    if (!DRY) await gql(SET, { p: project.id, i: item.id, f: f.id, o: opt.id });
    changed++;
  }
}
log(`${DRY ? 'Would change' : 'Changed'} ${changed} values; ${same} already right.`);
console.log(`::notice title=${DRY ? 'dry run' : 'applied'}::` + lines.join(' | ').slice(0, 3800));
