import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the workflow that keeps the board in step (#162), so an edit can't silently stop it.
const yaml = readFileSync('.github/workflows/board-sync.yml', 'utf8');
const runsOf = (text: string) => [...text.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('board sync workflow', () => {
  it('runs on every PR change that can move a card', () => {
    expect(yaml).toMatch(
      /^ {2}pull_request:\n {4}types: \[opened, reopened, edited, ready_for_review, converted_to_draft, closed\]\n/m,
    );
  });

  it('runs on every issue change the Ready rule depends on: assignee, blocker closed, label, milestone', () => {
    expect(yaml).toMatch(
      /^ {2}issues:\n {4}types: \[assigned, reopened, closed, labeled, unlabeled, milestoned, demilestoned\]\n/m,
    );
  });

  it('also sweeps on a schedule and on demand, to fix any card that drifted', () => {
    expect(yaml).toMatch(/^ {2}schedule:\n {4}- cron: '\S+ \S+ \S+ \S+ \S+'\n/m);
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('fires the cron three times an hour, so a dead implement session is retried within about 2 h (#201)', () => {
    expect(yaml).toMatch(/^ {4}- cron: '\d+(,\d+){2} \* \* \* \*'\n/m);
  });

  it('never runs two syncs at once', () => {
    expect(yaml).toMatch(/^ {4}concurrency:\n {6}group: board-sync\n {6}cancel-in-progress: false\n/m);
  });

  it('skips fork PRs, which get no secrets', () => {
    expect(yaml).toContain("(github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork)");
  });

  it('runs the sync with the project token from secrets', () => {
    expect(runsOf(yaml)).toContain('node scripts/board-sync.ts');
    expect(yaml).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
  });
});

describe('board sync workflow: auto-start', () => {
  it('passes the auto-start switches from repo variables', () => {
    expect(yaml).toContain('AUTO_SPAWN: ${{ vars.AUTO_SPAWN }}');
    expect(yaml).toContain('AUTO_STACK: ${{ vars.AUTO_STACK }}');
  });

  it('passes the feature freeze switch from its repo variable (#84)', () => {
    expect(yaml).toContain('FEATURE_FREEZE: ${{ vars.FEATURE_FREEZE }}');
  });

  it('passes both routine triggers from secrets', () => {
    for (const name of ['ROUTINE_SONNET_URL', 'ROUTINE_SONNET_TOKEN', 'ROUTINE_OPUS_URL', 'ROUTINE_OPUS_TOKEN'])
      expect(yaml).toContain(`${name}: \${{ secrets.${name} }}`);
  });
});

// A burst of events ends in one sweep (#293), with no cancelled run (a red ✗ on the PR) and no
// fixed wait (#417): scripts/debounce.ts lets the newest run sweep and the others pass green.
describe('board sync workflow: debounce', () => {
  const debounce = yaml.slice(yaml.indexOf('\n  debounce:\n'), yaml.indexOf('\n  board-sync:\n'));

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

// A hand-off label on a closed PR or issue is stale: nobody needs to act on it any more (#417).
describe('board sync workflow: clear hand-off labels on close', () => {
  const job = yaml.slice(yaml.indexOf('\n  clear-hand-off:\n'));

  it('runs only when a PR or an issue is closed, and not for fork PRs', () => {
    expect(job).toContain("if: github.event.action == 'closed'");
    expect(job).toContain('!github.event.pull_request.head.repo.fork');
  });

  it('may write labels with the built-in token', () => {
    expect(job).toMatch(/permissions:\n {6}issues: write\n {6}pull-requests: write\n/);
    expect(job).toContain('GH_TOKEN: ${{ github.token }}');
  });

  it('removes only the hand-off labels the item has, needs-you and needs-approval', () => {
    expect(job).toContain('(.pull_request // .issue).labels[].name');
    expect(job).toContain("grep -xE 'needs-you|needs-approval'");
    expect(job).toContain('gh api -X DELETE "repos/$GITHUB_REPOSITORY/issues/$NUMBER/labels/$label"');
  });
});
