import { pathToFileURL } from 'node:url';

/** Commit types allowed in PR titles. The squash commit's type drives the version bump (ADR-0004). */
export const COMMIT_TYPES = ['feat', 'fix', 'test', 'chore', 'docs', 'refactor', 'ci'] as const;

const TITLE = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([\\w./-]+\\))?!?: \\S`);

/** True when `title` is a Conventional Commit header: `type(scope)!: description`. */
export function isConventionalTitle(title: string): boolean {
  return TITLE.test(title);
}

/** The PR label that lets one `feat` PR merge during the feature freeze (#84). */
export const FREEZE_EXCEPTION_LABEL = 'freeze-exception';

/** The feature freeze is on only when the repo variable FEATURE_FREEZE is `true`; unset or anything else is off. */
export function isFeatureFreeze(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

const FEATURE = /^feat(\([\w./-]+\))?!?:/;

export interface TitleOptions {
  /** FEATURE_FREEZE is on. */
  readonly freeze: boolean;
  /** The PR's labels. */
  readonly labels: readonly string[];
}

/**
 * The PR title check: a Conventional Commit title, and during the feature freeze (#84) no `feat`
 * unless the PR carries the `freeze-exception` label.
 */
export function checkTitle(title: string, { freeze, labels }: TitleOptions): { ok: boolean; message: string } {
  if (!isConventionalTitle(title))
    return {
      ok: false,
      message:
        `PR title "${title}" is not a Conventional Commit.\n` +
        `Use "<type>: <description>" or "<type>(scope)!: <description>", where type is one of: ${COMMIT_TYPES.join(', ')}.\n` +
        'Example: "feat: tower targeting and firing". See docs/agents/workflow.md (Commit types and versions).',
    };
  if (freeze && FEATURE.test(title) && !labels.includes(FREEZE_EXCEPTION_LABEL))
    return {
      ok: false,
      message:
        `PR title "${title}" is a feat, and the feature freeze is on (repo variable FEATURE_FREEZE): ` +
        'no new features merge until v1.0.0 ships; fixes, tests, docs and polish carry on.\n' +
        `Retitle it if it isn't a feature, or ask the maintainer for the \`${FREEZE_EXCEPTION_LABEL}\` label. ` +
        'See docs/agents/workflow.md (Feature freeze).',
    };
  return { ok: true, message: `PR title OK: ${title}` };
}

// CI entry point: `PR_TITLE="..." PR_LABELS="a,b" FEATURE_FREEZE=true node scripts/pr-title.ts`, run by
// .github/workflows/pr-title.yml.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkTitle(process.env['PR_TITLE'] ?? '', {
    freeze: isFeatureFreeze(process.env['FEATURE_FREEZE']),
    labels: (process.env['PR_LABELS'] ?? '').split(',').map((l) => l.trim()),
  });
  if (result.ok) console.log(result.message);
  else {
    console.error(result.message);
    process.exitCode = 1;
  }
}
