// Opens one Claude Code session per Ready issue of a milestone, each in its own worktree and
// Windows Terminal tab.
// Usage: node spawn-sessions.mjs [--milestone <number|title|prefix>] [--issues 8,10] [--limit N]
//        [--prompt "Pick up issue #{n}."] [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { boardIssues, parseArgs, resolveMilestone } from '../_lib/board.mjs';

const args = parseArgs(process.argv.slice(2));
const milestone = resolveMilestone(args.milestone);
const dryRun = Boolean(args['dry-run']);
const only = args.issues ? String(args.issues).split(',').map((s) => Number(s.replace('#', '').trim())) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const template = typeof args.prompt === 'string' ? args.prompt : 'Pick up issue #{n}.';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
// New worktrees go under the main checkout, even when this runs from inside a worktree.
const repoRoot = dirname(resolve(git('rev-parse', '--path-format=absolute', '--git-common-dir')));
// wt treats ";" as a command separator.
const wtEscape = (s) => s.replaceAll(';', '\\;');

const ready = boardIssues().filter(
  (i) =>
    i.state === 'OPEN' &&
    i.status === 'Ready' &&
    i.milestone?.number === milestone.number &&
    (!only || only.includes(i.number)),
);

console.log(`Milestone: ${milestone.title}${dryRun ? ' (dry run)' : ''}`);
if (!ready.length) {
  console.log('No Ready issues to spawn. Run /promote-ready first?');
  process.exit(0);
}

if (!dryRun) git('fetch', 'origin');
let spawned = 0;
for (const issue of ready) {
  const path = join(repoRoot, '.claude', 'worktrees', `issue-${issue.number}`);
  if (issue.assignees.length) {
    console.log(`  skip #${issue.number}: assigned to ${issue.assignees.join(', ')}`);
    continue;
  }
  if (existsSync(path)) {
    console.log(`  skip #${issue.number}: worktree already exists (${path})`);
    continue;
  }
  if (spawned >= limit) break;
  const prompt = template.replaceAll('{n}', String(issue.number)).replaceAll('{title}', issue.title);
  const title = `#${issue.number} ${issue.title}`.slice(0, 40);
  if (!dryRun) {
    // Detached at origin/main: the session creates its <type>/<issue>-<slug> branch (workflow.md).
    git('worktree', 'add', '--detach', path, 'origin/main');
    execFileSync('wt', ['-w', 'Military-TD', 'new-tab', '--title', wtEscape(title), '-d', path, 'claude', wtEscape(prompt)]);
  }
  console.log(`  ${dryRun ? 'would spawn' : 'spawned'} #${issue.number} ${issue.title}\n    ${path}\n    prompt: ${prompt}`);
  spawned++;
}
console.log(`\n${spawned} session(s) ${dryRun ? 'would be ' : ''}opened.`);
