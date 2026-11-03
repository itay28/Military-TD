import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
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
  /** Locally `gh auth status`; in the cloud, whether `gh api` (REST through the proxy) reaches the repository. */
  readonly gh: 'logged-in' | 'logged-out' | 'missing' | 'rest-ok' | 'no-access' | 'unreachable';
  /** Which Chromium `npm run test:e2e` will launch (#327); left out when unchecked. */
  readonly e2e?: E2eBrowser | undefined;
}

export type E2eBrowser =
  | { readonly kind: 'pinned' }
  | { readonly kind: 'env'; readonly path: string }
  | { readonly kind: 'fallback'; readonly path: string }
  | { readonly kind: 'none' };

/** The cloud image's Chromium, which may be an older build than the one Playwright is pinned to. */
export const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Which browser e2e will use: `PW_CHROMIUM_PATH` if set (playwright.config.ts passes it on), else the
 * build Playwright is pinned to, else the cloud image's Chromium (which the session then points
 * `PW_CHROMIUM_PATH` at), else nothing.
 */
export function chooseE2eBrowser(input: {
  readonly envPath: string | undefined;
  readonly pinnedExists: boolean;
  readonly fallbackExists: boolean;
}): E2eBrowser {
  if (input.envPath) return { kind: 'env', path: input.envPath };
  if (input.pinnedExists) return { kind: 'pinned' };
  if (input.fallbackExists) return { kind: 'fallback', path: CLOUD_CHROMIUM };
  return { kind: 'none' };
}

function describeE2e(browser: E2eBrowser): string {
  switch (browser.kind) {
    case 'pinned':
      return 'e2e uses the pinned Playwright Chromium';
    case 'env':
      return `e2e uses PW_CHROMIUM_PATH=${browser.path}`;
    case 'fallback':
      return `e2e uses ${browser.path} via PW_CHROMIUM_PATH (the pinned Playwright build is not installed)`;
    case 'none':
      return 'e2e has no browser: the pinned Playwright build is not installed and there is no /opt/pw-browsers/chromium; do not run `playwright install` in the cloud';
  }
}

const REPO = 'itay28/Military-TD';

/** The problems in `facts`, and a one-line summary for the agent. */
export function diagnose(facts: Facts): { problems: string[]; summary: string } {
  const problems: string[] = [];
  const major = /^v?(\d+)/.exec(facts.node)?.[1];
  if (facts.wantedNode && major !== facts.wantedNode)
    problems.push(`node ${facts.node}, but .nvmrc wants ${facts.wantedNode}: scripts that run .ts directly may fail`);
  if (!facts.nodeModules) problems.push('node_modules missing: run `npm ci` before tests');
  if (facts.gh === 'missing') problems.push('gh not found: issue and PR steps need it (GitHub CLI)');
  if (facts.gh === 'logged-out') problems.push('gh is not logged in: run `gh auth login`, or set GH_TOKEN');
  if (facts.gh === 'no-access')
    problems.push(
      `no GitHub access to ${REPO}: attach the repository to this routine or session (claude.ai/code/routines → Edit → Repository); stop and report, nothing else will work`,
    );
  if (facts.gh === 'unreachable')
    problems.push(
      `GitHub REST check failed (network or timeout), not an access error: retry \`gh api repos/${REPO}\` before deciding anything`,
    );
  const head = `doctor (${facts.environment})`;
  const base = problems.length
    ? `${head}: ${problems.length} problem${problems.length > 1 ? 's' : ''}. ${problems.join('; ')}`
    : `${head}: ready`;
  const summary = facts.e2e ? `${base}. ${describeE2e(facts.e2e)}` : base;
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

// In the cloud, `gh auth status` always fails (the proxy injects the token), but REST works when the
// repository is attached to the session; GraphQL never does (docs/agents/workflow.md → Cloud sessions).
/** A failed `gh api repos/<repo>`: an HTTP 403/404 means the repository isn't attached; anything else (network, timeout) doesn't. */
export function cloudGhStateFrom(stderr: string): Facts['gh'] {
  return /\(HTTP 40[34]\)/.test(stderr) ? 'no-access' : 'unreachable';
}

function cloudGhState(): Facts['gh'] {
  try {
    execFileSync('gh', ['api', `repos/${REPO}`, '--silent'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15_000 });
    return 'rest-ok';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return cloudGhStateFrom(String((error as { stderr?: unknown }).stderr ?? ''));
  }
}

async function e2eBrowser(): Promise<E2eBrowser | undefined> {
  try {
    const { chromium } = await import('@playwright/test');
    return chooseE2eBrowser({
      envPath: process.env['PW_CHROMIUM_PATH'],
      pinnedExists: existsSync(chromium.executablePath()),
      fallbackExists: existsSync(CLOUD_CHROMIUM),
    });
  } catch {
    return undefined; // dependencies not installed yet; the node_modules problem already says so
  }
}

async function gatherFacts(root: string): Promise<Facts> {
  let wantedNode: string | undefined;
  try {
    wantedNode = /\d+/.exec(readFileSync(join(root, '.nvmrc'), 'utf8'))?.[0];
  } catch {
    wantedNode = undefined;
  }
  const environment = process.env['CLAUDE_CODE_REMOTE'] === 'true' ? 'cloud' : 'local';
  return {
    environment,
    node: process.version,
    wantedNode,
    nodeModules: existsSync(join(root, 'node_modules')),
    gh: environment === 'cloud' ? cloudGhState() : ghState(),
    e2e: await e2eBrowser(),
  };
}

// `--hook` prints SessionStart JSON for Claude Code; otherwise plain text.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const facts = await gatherFacts(root);
  const { summary } = diagnose(facts);
  // Later Bash calls in the session read CLAUDE_ENV_FILE, so e2e finds the browser with no manual steps.
  const envFile = process.env['CLAUDE_ENV_FILE'];
  if (envFile && facts.e2e?.kind === 'fallback') appendFileSync(envFile, `export PW_CHROMIUM_PATH=${facts.e2e.path}\n`);
  if (process.argv.includes('--hook'))
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: summary } }));
  else console.log(summary);
}
