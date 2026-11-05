import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the PR steward workflow (#168), so an edit can't silently stop it.
const yaml = readFileSync('.github/workflows/pr-steward.yml', 'utf8');
const runsOf = (text: string) => [...text.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('PR steward workflow', () => {
  it('runs after CI and the CI review finish', () => {
    expect(yaml).toMatch(/^ {2}workflow_run:\n {4}workflows: \[CI, Claude Code Review\]\n {4}types: \[completed\]\n/m);
  });

  it('runs on PR comments and reviews, a push to main, a schedule and on demand', () => {
    expect(yaml).toMatch(/^ {2}issue_comment:\n {4}types: \[created\]\n/m);
    expect(yaml).toMatch(/^ {2}pull_request_review:\n {4}types: \[submitted\]\n/m);
    expect(yaml).toMatch(/^ {2}push:\n {4}branches: \[main\]\n/m);
    expect(yaml).toMatch(/^ {2}schedule:\n {4}- cron: '\S+ \S+ \S+ \S+ \S+'\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  // A public repo lets anyone comment; only the maintainer's comments and reviews may wake it (#221).
  it('skips comments and reviews from people outside the repo', () => {
    for (const who of ['comment', 'review'])
      expect(yaml).toContain(
        `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.${who}.author_association)`,
      );
  });

  it('fires the cron three times an hour, so a round that died is retried soon after its 1 hour timeout (#196)', () => {
    expect(yaml).toMatch(/^ {4}- cron: '\d+(,\d+){2} \* \* \* \*'\n/m);
  });

  it('never runs two at once', () => {
    expect(yaml).toMatch(/^ {4}concurrency:\n {6}group: pr-steward\n {6}cancel-in-progress: false\n/m);
  });

  it('runs the steward with the project token, its switches and its secrets', () => {
    expect(runsOf(yaml)).toContain('node scripts/pr-steward.ts');
    for (const line of [
      'PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}',
      'AUTO_STEWARD: ${{ vars.AUTO_STEWARD }}',
      'AUTO_MERGE: ${{ vars.AUTO_MERGE }}',
      'ROUTINE_STEWARD_URL: ${{ secrets.ROUTINE_STEWARD_URL }}',
      'ROUTINE_STEWARD_TOKEN: ${{ secrets.ROUTINE_STEWARD_TOKEN }}',
    ])
      expect(yaml).toContain(line);
  });
});

// A burst of events ends in one sweep (#293), with no cancelled run (a red ✗ on the PR) and no
// fixed wait (#417): scripts/debounce.ts lets the newest run sweep and the others pass green.
describe('PR steward workflow: debounce', () => {
  const debounce = yaml.slice(yaml.indexOf('\n  debounce:\n'), yaml.indexOf('\n  pr-steward:\n'));

  it('gates every run, scheduled and manual ones too, with the debounce script', () => {
    expect(debounce).toContain('run: node scripts/debounce.ts');
    expect(debounce).not.toContain("github.event_name != 'schedule'");
  });

  it('never cancels a run and never sleeps', () => {
    expect(yaml).not.toContain('cancel-in-progress: true');
    expect(yaml).not.toMatch(/run: sleep/);
    expect(debounce).not.toContain('concurrency:');
  });

  it('reads the workflow runs with the built-in token', () => {
    expect(debounce).toMatch(/permissions:\n {6}actions: read\n/);
    expect(debounce).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(debounce).toMatch(/outputs:\n {6}go: \$\{\{ steps\.gate\.outputs\.go \}\}\n/);
  });

  it('sweeps only when the gate says go', () => {
    expect(yaml).toMatch(/^ {4}needs: debounce\n {4}if: needs\.debounce\.outputs\.go == 'true'\n/m);
  });
});

// Status labels follow within one run, not the hourly sweep (#419).
describe('PR steward workflow: freshness of the status labels', () => {
  const debounce = yaml.slice(yaml.indexOf('\n  debounce:\n'), yaml.indexOf('\n  pr-steward:\n'));

  it('runs when a PR turns draft or ready or closes, and on issue label, milestone and close changes', () => {
    expect(yaml).toMatch(/^ {2}pull_request:\n {4}types: \[converted_to_draft, ready_for_review, closed\]\n/m);
    expect(yaml).toMatch(/^ {2}issues:\n {4}types: \[labeled, unlabeled, milestoned, demilestoned, closed\]\n/m);
  });

  // Its own label writes on PRs would wake it again.
  it('does not run on PR label changes', () => {
    expect(yaml).not.toMatch(/^ {2}pull_request:\n {4}types: \[[^\]]*\blabeled\b/m);
  });

  it("lets through the maintainer's comment on a needs-info issue, and skips fork PR events", () => {
    expect(debounce).toContain("contains(github.event.issue.labels.*.name, 'needs-info')");
    expect(debounce).toContain("(github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork)");
  });
});
