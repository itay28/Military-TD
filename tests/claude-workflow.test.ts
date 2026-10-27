import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the @claude workflow (#221): in a public repo anyone can write @claude, so only the
// maintainer's comments, reviews and issues may start it.
const yaml = readFileSync('.github/workflows/claude.yml', 'utf8');
const branches = yaml.split('\n').filter((line) => line.trim().startsWith("(github.event_name == '"));
const maintainer = `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.`;

describe('@claude workflow', () => {
  it('has a branch for comments, review comments, reviews and issues', () => {
    expect(branches.map((line) => line.match(/event_name == '(\w+)'/)?.[1])).toEqual([
      'issue_comment',
      'pull_request_review_comment',
      'pull_request_review',
      'issues',
    ]);
  });

  it('starts only for the maintainer', () => {
    for (const line of branches) expect(line).toContain(maintainer);
  });
});
