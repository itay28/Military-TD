import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCredits, type Manifest, type ManifestEntry } from './credits.ts';

// Resolves a PR's merge conflict with its base without an agent, when every conflicting file is
// generated or append-only (#474). PR steward runs it before firing a `conflict` round
// (docs/agents/issue-tracker.md → PR steward). The rules, one per file kind:
//   CREDITS.md            regenerated from the merged manifest (`npm run credits`'s renderCredits)
//   assets/manifest.json  a 3-way merge of `packs` keyed by `id`; the same id changed both ways aborts
//   GLOSSARY.md           a 3-way merge of the table rows keyed by the bold term; same clash rule
//   e2e screenshot PNGs   the base's version; the steward then starts *Update snapshots* to remake them
// Anything else aborts, and so do aria snapshots (`*.aria.yml`): only a browser can remake them,
// and *Update snapshots* remakes PNGs only, so they go to an agent round.

export type Rule = 'credits' | 'manifest' | 'glossary' | 'baseline';

const BASELINE = /^tests\/e2e\/[^/]+\.spec\.ts-snapshots\/[^/]+\.png$/;

/** The rule that resolves a conflict in `path`, or null when only an agent can. */
export function ruleFor(path: string): Rule | null {
  if (path === 'CREDITS.md') return 'credits';
  if (path === 'assets/manifest.json') return 'manifest';
  if (path === 'GLOSSARY.md') return 'glossary';
  return BASELINE.test(path) ? 'baseline' : null;
}

export type MergeResult<T> = { ok: true; items: T[] } | { ok: false; clash: string };
export type TextMerge = { ok: true; text: string } | { ok: false; clash: string };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A 3-way merge of keyed entries, in `ours`' order. Each side's additions are kept (each new entry
 * of `theirs` goes after the entry before it on their side, and after our own additions there), a change or delete
 * made on one side wins, and an entry both sides added identically appears once. A key both sides changed (or
 * one changed and the other deleted) differently is a clash.
 */
export function mergeKeyed<T>(
  base: readonly T[],
  ours: readonly T[],
  theirs: readonly T[],
  key: (item: T) => string,
  same: (a: T, b: T) => boolean = sameJson,
): MergeResult<T> {
  const byKey = (items: readonly T[]) => new Map(items.map((item) => [key(item), item]));
  const [b, o, t] = [byKey(base), byKey(ours), byKey(theirs)];
  const items: T[] = [];
  for (const mine of ours) {
    const k = key(mine);
    const was = b.get(k);
    const other = t.get(k);
    if (other === undefined) {
      if (was === undefined) items.push(mine);
      else if (!same(mine, was)) return { ok: false, clash: k };
    } else if (same(mine, other) || (was !== undefined && same(other, was))) items.push(mine);
    else if (was !== undefined && same(mine, was)) items.push(other);
    else return { ok: false, clash: k };
  }
  for (const [i, other] of theirs.entries()) {
    const k = key(other);
    if (o.has(k)) continue;
    const was = b.get(k);
    if (was !== undefined) {
      // We deleted it: fine if they left it alone.
      if (!same(other, was)) return { ok: false, clash: k };
      continue;
    }
    const before = theirs
      .slice(0, i)
      .reverse()
      .find((prev) => items.some((item) => key(item) === key(prev)));
    let at = before === undefined ? 0 : items.findIndex((item) => key(item) === key(before)) + 1;
    // After our own additions there, so each side's new entries stay together, ours first.
    while (at < items.length && !b.has(key(items[at]!)) && !t.has(key(items[at]!))) at++;
    items.splice(at, 0, other);
  }
  return { ok: true, items };
}

const PRINT_WIDTH = 120;

/** `assets/manifest.json` as prettier writes it (the repo's .prettierrc), so the merge passes format:check. */
export function formatManifest(manifest: Manifest): string {
  const print = (value: unknown, indent: string, prefix: string, last: boolean): string[] => {
    const comma = last ? '' : ',';
    if (Array.isArray(value)) {
      if (!value.length) return [`${indent}${prefix}[]${comma}`];
      if (value.every((v) => typeof v !== 'object' || v === null)) {
        const flat = `${indent}${prefix}[${value.map((v) => JSON.stringify(v)).join(', ')}]${comma}`;
        if (flat.length <= PRINT_WIDTH) return [flat];
      }
      return [
        `${indent}${prefix}[`,
        ...value.flatMap((v, i) => print(v, `${indent}  `, '', i === value.length - 1)),
        `${indent}]${comma}`,
      ];
    }
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value);
      if (!entries.length) return [`${indent}${prefix}{}${comma}`];
      return [
        `${indent}${prefix}{`,
        ...entries.flatMap(([k, v], i) => print(v, `${indent}  `, `${JSON.stringify(k)}: `, i === entries.length - 1)),
        `${indent}}${comma}`,
      ];
    }
    return [`${indent}${prefix}${JSON.stringify(value)}${comma}`];
  };
  return `${print(manifest, '', '', true).join('\n')}\n`;
}

/** Merges three versions of `assets/manifest.json` (`base` null when both sides added the file). */
export function mergeManifest(base: string | null, ours: string, theirs: string): TextMerge {
  const parse = (text: string) => JSON.parse(text) as Manifest;
  const [b, o, t] = [base === null ? { packs: [] } : parse(base), parse(ours), parse(theirs)];
  const packs = mergeKeyed<ManifestEntry>(b.packs, o.packs, t.packs, (p) => p.id);
  return packs.ok ? { ok: true, text: formatManifest({ ...t, ...o, packs: packs.items }) } : packs;
}

const TERM_ROW = /^\| \*\*(.+?)\*\*/;

/** A glossary split into the text before its term rows, the rows, and the text after them. */
function splitGlossary(text: string): { head: string; rows: string[]; tail: string } {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => TERM_ROW.test(l));
  if (first < 0) return { head: text, rows: [], tail: '' };
  let end = first;
  while (end < lines.length && TERM_ROW.test(lines[end]!)) end++;
  const tail = lines.slice(end).join('\n');
  if (tail.split('\n').some((l) => TERM_ROW.test(l))) throw new Error('GLOSSARY.md has more than one table');
  return { head: lines.slice(0, first).join('\n'), rows: lines.slice(first, end), tail };
}

/** A 3-way merge of one block of text: either side's change, or a clash when both changed it differently. */
const mergeBlock = (base: string, ours: string, theirs: string): string | null =>
  ours === theirs || theirs === base ? ours : ours === base ? theirs : null;

/** Merges three versions of `GLOSSARY.md` row by row, keyed by each row's bold term. */
export function mergeGlossary(base: string | null, ours: string, theirs: string): TextMerge {
  const [b, o, t] = [splitGlossary(base ?? ''), splitGlossary(ours), splitGlossary(theirs)];
  const head = mergeBlock(b.head, o.head, t.head);
  const tail = mergeBlock(b.tail, o.tail, t.tail);
  if (head === null || tail === null) return { ok: false, clash: 'the text around the table' };
  const rows = mergeKeyed(
    b.rows,
    o.rows,
    t.rows,
    (row) => TERM_ROW.exec(row)![1]!,
    (x, y) => x === y,
  );
  if (!rows.ok) return rows;
  return { ok: true, text: (rows.items.length ? [head, ...rows.items, tail] : [head]).join('\n') };
}

export type AutoResolveResult =
  | { readonly kind: 'resolved'; readonly files: readonly string[]; readonly baselines: boolean }
  | { readonly kind: 'aborted'; readonly why: string };

export interface AutoResolveOptions {
  /** A checkout of the repository (the steward's own); it's left as it was. */
  readonly dir: string;
  /** Where to fetch from and push to. In the Action it carries PROJECT_TOKEN, so it never appears in a result. */
  readonly remote: string;
  /** The PR's branch and its base. */
  readonly head: string;
  readonly base: string;
}

const IDENTITY = [
  '-c',
  'user.name=github-actions[bot]',
  '-c',
  'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

class GitError extends Error {}

/** The environment without git's own variables: run from a git hook, GIT_DIR / GIT_INDEX_FILE would point it at the wrong repo. */
export const cleanEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_TERMINAL_PROMPT: '0',
});

/**
 * Merges `base` into the PR branch in a temporary worktree and resolves every conflict by its rule,
 * then pushes the merge commit (a normal one: no force, no history rewrite). Any conflict without
 * a rule, a clash, or a branch that moved meanwhile aborts with nothing pushed.
 */
export async function autoResolve({ dir, remote, head, base }: AutoResolveOptions): Promise<AutoResolveResult> {
  const hide = (text: string) => text.split(remote).join('<remote>');
  const git = (args: readonly string[], cwd = dir) =>
    new Promise<string>((resolve, reject) =>
      execFile(
        'git',
        [...IDENTITY, ...args],
        { cwd, maxBuffer: 256 * 1024 * 1024, env: cleanEnv() },
        (error, stdout, stderr) =>
          error
            ? reject(new GitError(hide(`git ${args[0]}: ${String(stderr).trim() || error.message}`)))
            : resolve(stdout),
      ),
    );
  const maybe = (args: readonly string[], cwd?: string) => git(args, cwd).catch(() => null);

  const refs = { head: 'refs/auto-resolve/head', base: 'refs/auto-resolve/base' };
  const tree = mkdtempSync(join(tmpdir(), 'auto-resolve-'));
  let added = false;
  try {
    const shallow = (await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true';
    await git([
      'fetch',
      '--quiet',
      '--no-tags',
      ...(shallow ? ['--unshallow'] : []),
      remote,
      `+refs/heads/${head}:${refs.head}`,
      `+refs/heads/${base}:${refs.base}`,
    ]);
    await git(['worktree', 'add', '--quiet', '--detach', tree, refs.head]);
    added = true;
    const wt = (args: readonly string[]) => git(args, tree);
    const merged = await maybe(['merge', '--quiet', '--no-ff', '--no-commit', refs.base], tree);
    const files = (await wt(['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
    if (merged === null && !files.length) return { kind: 'aborted', why: `the merge failed without a conflict` };

    const unknown = files.find((f) => ruleFor(f) === null);
    if (unknown) return { kind: 'aborted', why: `${unknown} has no mechanical rule` };

    const stage = (n: 1 | 2 | 3, path: string) => maybe(['show', `:${n}:${path}`], tree);
    let baselines = false;
    for (const path of files) {
      const rule = ruleFor(path)!;
      if (rule === 'baseline') {
        baselines = true;
        await ((await stage(3, path)) === null
          ? wt(['rm', '--quiet', '--', path])
          : wt(['checkout', '--theirs', '--', path]).then(() => wt(['add', '--', path])));
      } else if (rule === 'manifest' || rule === 'glossary') {
        const [b, o, t] = [await stage(1, path), await stage(2, path), await stage(3, path)];
        if (o === null || t === null) return { kind: 'aborted', why: `${path}: deleted on one side` };
        const result = (rule === 'manifest' ? mergeManifest : mergeGlossary)(b, o, t);
        if (!result.ok) return { kind: 'aborted', why: `${path}: both sides changed "${result.clash}"` };
        writeFileSync(join(tree, path), result.text);
        await wt(['add', '--', path]);
      }
    }
    // Last, from the merged manifest: CREDITS.md is generated from it.
    if (files.includes('CREDITS.md') || files.includes('assets/manifest.json')) {
      const manifest = JSON.parse(readFileSync(join(tree, 'assets/manifest.json'), 'utf8')) as Manifest;
      writeFileSync(join(tree, 'CREDITS.md'), renderCredits(manifest));
      await wt(['add', '--', 'CREDITS.md']);
    }
    if ((await wt(['diff', '--name-only', '--diff-filter=U'])).trim())
      return { kind: 'aborted', why: 'conflicts were left after the rules ran' };

    await wt([
      'commit',
      '--quiet',
      '--no-verify',
      '-m',
      `Merge ${base} into ${head}`,
      '-m',
      `PR steward resolved the conflicts in generated files without an agent (#474): ${files.join(', ')}.`,
    ]);
    // No force: if the branch moved since the fetch, the push is refused and nothing changes.
    await wt(['push', '--quiet', remote, `HEAD:refs/heads/${head}`]);
    return { kind: 'resolved', files, baselines };
  } catch (error) {
    if (error instanceof GitError) return { kind: 'aborted', why: error.message };
    return { kind: 'aborted', why: hide(`${String(error)}`) };
  } finally {
    if (added) await maybe(['worktree', 'remove', '--force', tree]);
    rmSync(tree, { recursive: true, force: true });
    await maybe(['worktree', 'prune']);
    for (const ref of Object.values(refs)) await maybe(['update-ref', '-d', ref]);
  }
}
