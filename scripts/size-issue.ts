import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sizingNeeds } from './auto-start.ts';
import { graphql } from './board-sync.ts';

// The check before the sizing agent (.github/workflows/size-issue.yml, #205): it only runs for issues
// nobody sized, or game work with no milestone (#225). The decision is pure (sizingNeeds in
// auto-start.ts); the CLI reads the issue's labels, milestone and its Size on the board.

const PROJECT_NUMBER = 4;

const ISSUE_QUERY = `query($number: Int!) {
  repository(owner: "itay28", name: "Military-TD") {
    issue(number: $number) {
      labels(first: 50) { nodes { name } }
      milestone { number }
      projectItems(first: 10) {
        nodes {
          project { number }
          size: fieldValueByName(name: "Size") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          area: fieldValueByName(name: "Area") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }
  }
}`;

interface IssueData {
  repository: {
    issue: {
      labels: { nodes: { name: string }[] };
      milestone: { number: number } | null;
      projectItems: {
        nodes: { project: { number: number }; size: { name?: string } | null; area: { name?: string } | null }[];
      };
    } | null;
  };
}

// CLI: `node scripts/size-issue.ts <issue>`, with PROJECT_TOKEN (classic PAT, project + repo scopes).
// Prints the answer and writes `needed`, `size` and `milestone` (true|false) to GITHUB_OUTPUT when it is set.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  const number = Number(process.argv[2]);
  if (!token || !Number.isInteger(number) || number < 1) {
    console.log('::error::Usage: PROJECT_TOKEN=… node scripts/size-issue.ts <issue number>');
    process.exitCode = 1;
  } else {
    const { issue } = (await graphql<IssueData>(token, ISSUE_QUERY, { number })).repository;
    if (!issue) throw new Error(`#${number}: no such issue`);
    const item = issue.projectItems.nodes.find((n) => n.project.number === PROJECT_NUMBER);
    const size = item?.size?.name;
    const needs = sizingNeeds(
      issue.labels.nodes.map((l) => l.name),
      size,
      issue.milestone?.number ?? null,
      item?.area?.name,
    );
    const needed = needs.size || needs.milestone;
    const what = [needs.size && 'a Size', needs.milestone && 'a milestone'].filter(Boolean).join(' and ');
    console.log(`#${number}: ${needed ? `needs ${what}` : 'sized, with a milestone or infra'}`);
    if (process.env['GITHUB_OUTPUT'])
      appendFileSync(
        process.env['GITHUB_OUTPUT'],
        `needed=${needed}\nsize=${needs.size}\nmilestone=${needs.milestone}\n`,
      );
  }
}
