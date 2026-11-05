import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A CI agent runs with `--allowedTools`, and nobody is there to approve a denied command (#448).
// Claude Code matches a `Bash(...)` rule against the start of the command, so every `gh …`
// command in an agent prompt must start with something the workflow allows.
const ISSUE = '123';
const REPO = 'itay28/Military-TD';

const allowedBash = (workflow: string): RegExp[] => {
  const tools = /--allowedTools "([^"]+)"/.exec(workflow)?.[1] ?? '';
  return [...tools.matchAll(/Bash\(([^)]*)\)/g)].map((m) => {
    const rule = (m[1] ?? '').replaceAll('${{ github.repository }}', REPO).replaceAll('${{ env.ISSUE }}', ISSUE);
    // `cmd:*` is a prefix rule; a bare `*` is a wildcard.
    const source = rule
      .replace(/:\*$/, '*')
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${source}`);
  });
};

const commandsOf = (prompt: string): string[] =>
  [...prompt.matchAll(/`(gh [^`]+)`/g)].map((m) =>
    (m[1] ?? '').replace(/<[^>]*>/g, (p) => (p === '<n>' ? ISSUE : 'x')),
  );

const AGENTS = [
  ['split', 'split-issue'],
  ['size', 'size-issue'],
] as const;

describe.each(AGENTS)('%s agent prompt', (prompt, workflow) => {
  const rules = allowedBash(readFileSync(`.github/workflows/${workflow}.yml`, 'utf8'));
  const commands = commandsOf(readFileSync(`docs/agents/prompts/${prompt}.md`, 'utf8'));

  it('has commands and allow rules to check', () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(commands.length).toBeGreaterThan(0);
  });

  it.each(commands)('allows `%s`', (command) => {
    expect(rules.some((rule) => rule.test(command))).toBe(true);
  });
});
