import { pathToFileURL } from 'node:url';

/** Commit types allowed in PR titles. The squash commit's type drives the version bump (ADR-0004). */
export const COMMIT_TYPES = ['feat', 'fix', 'test', 'chore', 'docs', 'refactor', 'ci'] as const;

const TITLE = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([\\w./-]+\\))?!?: \\S`);

/** True when `title` is a Conventional Commit header: `type(scope)!: description`. */
export function isConventionalTitle(title: string): boolean {
  return TITLE.test(title);
}

// CI entry point: `PR_TITLE="..." node scripts/pr-title.ts`, run by .github/workflows/pr-title.yml.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const title = process.env['PR_TITLE'] ?? '';
  if (isConventionalTitle(title)) {
    console.log(`PR title OK: ${title}`);
  } else {
    console.error(
      `PR title "${title}" is not a Conventional Commit.\n` +
        `Use "<type>: <description>" or "<type>(scope)!: <description>", where type is one of: ${COMMIT_TYPES.join(', ')}.\n` +
        'Example: "feat: tower targeting and firing". See docs/agents/workflow.md (Commit types and versions).',
    );
    process.exitCode = 1;
  }
}
