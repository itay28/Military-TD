import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the workflows that push to the maintainer's phone (#169), so an edit can't silently stop them.
const notify = readFileSync('.github/workflows/notify.yml', 'utf8');
const release = readFileSync('.github/workflows/release-please.yml', 'utf8');
const runsOf = (yaml: string) => [...yaml.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('notify workflow', () => {
  it('runs when a PR or an issue is labelled', () => {
    expect(notify).toMatch(/^on:\n {2}pull_request:\n {4}types: \[labeled\]\n {2}issues:\n {4}types: \[labeled\]\n/m);
  });

  it('only starts for the needs-you and needs-info labels', () => {
    expect(notify).toContain(
      "    if: github.event.label.name == 'needs-you' || github.event.label.name == 'needs-info'\n",
    );
  });

  it('pushes for the event, with the topic and token in env', () => {
    expect(runsOf(notify)).toEqual(['node scripts/notify.ts event']);
    expect(notify).toContain('NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}');
    expect(notify).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });
});

describe('release workflow: notify job', () => {
  // From the job's header to the next job's header (or the end of the file).
  const job = /\n {2}notify:\n(?:(?! {2}\S).*\n?)*/.exec(release)?.[0] ?? '';

  it('runs after release-please, only when it created a release', () => {
    expect(job).toContain('    needs: release-please\n');
    expect(job).toContain("    if: needs.release-please.outputs.release_created == 'true'\n");
  });

  it('pushes the release for the tag, with the topic and tag in env', () => {
    expect(runsOf(job)).toEqual(['node scripts/notify.ts release "$TAG"']);
    expect(job).toContain('TAG: ${{ needs.release-please.outputs.tag_name }}');
    expect(job).toContain('NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}');
  });
});
