import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Cloud sessions never install plugins, so the workflow's skills are vendored into .claude/skills (#170).
const root = '.claude/skills';
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const vendored = ['tdd', 'pr', 'diagnosing-bugs'];

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(root, path).replaceAll('\\', '/')];
  });

describe('vendored skills', () => {
  it.each(vendored)('%s has a SKILL.md with its own name', (skill) => {
    const body = readFileSync(join(root, skill, 'SKILL.md'), 'utf8');
    expect(body).toMatch(new RegExp(`^---\\nname: ${skill}\\n`));
  });

  it('keeps the upstream MIT license', () => {
    expect(readFileSync(join(root, 'LICENSE-mattpocock-skills'), 'utf8')).toMatch(
      /^MIT License\n\nCopyright \(c\) \d{4} Matt Pocock/,
    );
  });

  it('names the source repository and the pinned commit', () => {
    expect(readme).toContain('https://github.com/mattpocock/skills');
    expect(readme).toMatch(/commit `[0-9a-f]{40}`/);
  });

  it('lists every vendored file in the README', () => {
    const files = filesUnder(root).filter((f) => vendored.some((s) => f.startsWith(`${s}/`)));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readme).toContain(`\`${file}\``);
  });
});
