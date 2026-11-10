import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the split agent's workflow (#303): an issue whose implement session died twice is split
// into smaller issues, on Opus, by an agent that may only touch issues.
const yaml = readFileSync('.github/workflows/split-issue.yml', 'utf8');
const allowedTools = /--allowedTools "([^"]+)"/.exec(yaml)?.[1]?.split(',') ?? [];

describe('split issue workflow', () => {
  it('runs when the maintainer identity (auto-start) labels an issue needs-split, and on demand', () => {
    expect(yaml).toMatch(/^ {2}issues:\n {4}types: \[labeled\]\n/m);
    expect(yaml).toContain("github.event.label.name == 'needs-split'");
    expect(yaml).toContain('github.actor == github.repository_owner');
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('names each run after its issue, so Board sync can tell the runs apart (#486)', () => {
    expect(yaml).toContain('run-name: Split issue #${{ github.event.issue.number || inputs.issue }}');
  });

  it('runs Claude on Opus with the OAuth token and the split prompt', () => {
    expect(yaml).toContain('uses: anthropics/claude-code-action@v1');
    expect(yaml).toContain('claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect(yaml).toMatch(/claude_args: '--model opus /);
    expect(yaml).toContain('docs/agents/prompts/split.md');
  });

  it('may read the repo and work on issues and the draft PR body, nothing else', () => {
    expect(allowedTools).toEqual([
      'Read',
      'Glob',
      'Grep',
      'Bash(git log:*)',
      'Bash(git diff:*)',
      'Bash(gh issue view:*)',
      'Bash(gh issue create:*)',
      'Bash(gh issue edit:*)',
      'Bash(gh issue comment:*)',
      'Bash(gh issue close ${{ env.ISSUE }} *)',
      'Bash(gh pr view:*)',
      'Bash(gh pr edit:*)',
      'Bash(gh api repos/${{ github.repository }}/issues/*)',
      'Bash(gh api repos/${{ github.repository }}/milestones*)',
    ]);
  });

  it('dispatches Board sync afterwards, since issues made with GITHUB_TOKEN start no workflow', () => {
    expect(yaml).toContain('run: gh workflow run board-sync.yml');
    expect(yaml).toMatch(/^ {6}actions: write\n/m);
  });
});
