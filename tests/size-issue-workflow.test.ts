import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the sizing agent's workflow (#205): when it runs, on which model, and what it may do.
const yaml = readFileSync('.github/workflows/size-issue.yml', 'utf8');
const allowedTools = /--allowedTools "([^"]+)"/.exec(yaml)?.[1]?.split(',') ?? [];

describe('size issue workflow', () => {
  it('runs when an issue is labelled ready-for-agent, and on demand', () => {
    expect(yaml).toMatch(/^ {2}issues:\n {4}types: \[labeled\]\n/m);
    expect(yaml).toContain("github.event_name == 'workflow_dispatch' || github.event.label.name == 'ready-for-agent'");
    expect(yaml).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('only runs the agent when the issue needs sizing', () => {
    expect(yaml).toContain('run: node scripts/size-issue.ts');
    expect(yaml).toContain("if: steps.check.outputs.needed == 'true'");
    expect(yaml).toContain('PROJECT_TOKEN: ${{ secrets.PROJECT_TOKEN }}');
  });

  it('runs Claude on Sonnet with the OAuth token and the size prompt', () => {
    expect(yaml).toContain('uses: anthropics/claude-code-action@v1');
    expect(yaml).toContain('claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect(yaml).toMatch(/claude_args: '--model sonnet /);
    expect(yaml).toContain('docs/agents/prompts/size.md');
  });

  it('allows reading, adding labels and commenting on the one issue, nothing else', () => {
    expect(allowedTools).toEqual([
      'Read',
      'Glob',
      'Grep',
      'Bash(gh issue view ${{ env.ISSUE }} *)',
      'Bash(gh issue edit ${{ env.ISSUE }} --add-label *)',
      'Bash(gh issue comment ${{ env.ISSUE }} *)',
    ]);
  });

  it('dispatches Board sync afterwards, since labels added by GITHUB_TOKEN start no workflow', () => {
    expect(yaml).toContain('run: gh workflow run board-sync.yml');
    expect(yaml).toMatch(/^ {6}actions: write\n/m);
  });
});
