import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Checks what an agent session needs, the same way locally, over Remote Control and in the
// cloud (docs/agents/tooling.md → Environments). Run by the SessionStart hook in
// .claude/settings.json, or by hand with `npm run doctor`. Never fails: it only reports.

export interface Facts {
  readonly environment: 'local' | 'cloud';
  /** `process.version`, e.g. 'v24.20.0'. */
  readonly node: string;
  /** The major version in `.nvmrc`, if there is one. */
  readonly wantedNode: string | undefined;
  readonly nodeModules: boolean;
  readonly gh: 'logged-in' | 'logged-out' | 'missing';
}

/** The problems in `facts`, and a one-line summary for the agent. */
export function diagnose(facts: Facts): { problems: string[]; summary: string } {
  const problems: string[] = [];
  const major = /^v?(\d+)/.exec(facts.node)?.[1];
  if (facts.wantedNode && major !== facts.wantedNode)
    problems.push(`node ${facts.node}, but .nvmrc wants ${facts.wantedNode}: scripts that run .ts directly may fail`);
  if (!facts.nodeModules) problems.push('node_modules missing: run `npm ci` before tests');
  if (facts.gh === 'missing') problems.push('gh not found: issue and PR steps need it (GitHub CLI)');
  if (facts.gh === 'logged-out') problems.push('gh is not logged in: run `gh auth login`, or set GH_TOKEN');
  const head = `doctor (${facts.environment})`;
  const summary = problems.length
    ? `${head}: ${problems.length} problem${problems.length > 1 ? 's' : ''}. ${problems.join('; ')}`
    : `${head}: ready`;
  return { problems, summary };
}

// Background sessions on Windows may start with a PATH that lacks gh (docs/agents/tooling.md).
const GH_CANDIDATES = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'];

function ghState(): Facts['gh'] {
  for (const gh of GH_CANDIDATES) {
    try {
      execFileSync(gh, ['auth', 'status'], { stdio: 'ignore', timeout: 10_000 });
      return 'logged-in';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'logged-out';
    }
  }
  return 'missing';
}

function gatherFacts(root: string): Facts {
  let wantedNode: string | undefined;
  try {
    wantedNode = /\d+/.exec(readFileSync(join(root, '.nvmrc'), 'utf8'))?.[0];
  } catch {
    wantedNode = undefined;
  }
  return {
    environment: process.env['CLAUDE_CODE_REMOTE'] === 'true' ? 'cloud' : 'local',
    node: process.version,
    wantedNode,
    nodeModules: existsSync(join(root, 'node_modules')),
    gh: ghState(),
  };
}

// `--hook` prints SessionStart JSON for Claude Code; otherwise plain text.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const { summary } = diagnose(gatherFacts(root));
  if (process.argv.includes('--hook'))
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: summary } }));
  else console.log(summary);
}
