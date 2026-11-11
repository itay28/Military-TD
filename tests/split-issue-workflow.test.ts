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

  it('may read the repo, write its plan file and work on issues and the draft PR body, nothing else', () => {
    expect(allowedTools).toEqual([
      'Read',
      'Glob',
      'Grep',
      'Edit(./split-plan.json)',
      'Write(./split-plan.json)',
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

  // #488: the agent's link calls were denied at random, so a plain step links the parts.
  it('links the parts in a plain step after Claude and before Board sync, when there is a plan', () => {
    const claude = yaml.indexOf('uses: anthropics/claude-code-action@v1');
    const link = yaml.indexOf('run: node scripts/split-links.ts split-plan.json');
    const board = yaml.indexOf('run: gh workflow run board-sync.yml');
    expect(claude).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(claude);
    expect(board).toBeGreaterThan(link);
    expect(yaml).toContain("if: hashFiles('split-plan.json') != ''");
    expect(yaml).toContain('node-version-file: .nvmrc');
    expect(yaml).toContain('NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}');
  });

  it("uploads Claude's execution output for a short time, so denials can be read later", () => {
    expect(yaml).toContain('uses: actions/upload-artifact@v4');
    expect(yaml).toContain('path: ${{ steps.split.outputs.execution_file }}');
    expect(yaml).toMatch(/retention-days: [1-7]\n/);
    expect(yaml).toMatch(/- name: Upload Claude's execution output\n {8}if: always\(\)/);
  });

  it('keeps the agent from linking issues itself', () => {
    const prompt = readFileSync('docs/agents/prompts/split.md', 'utf8');
    expect(prompt).not.toMatch(/sub_issues|blocked_by/);
    expect(prompt).toContain('split-plan.json');
  });
});
