import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { graphql } from './board-sync.ts';

// The check before the sizing agent (.github/workflows/size-issue.yml, #205): it only sizes issues
// nobody sized. The decision is pure; the CLI reads the issue's labels and its Size on the board.

const PROJECT_NUMBER = 4;

/** True when the issue has no Size on the board and no `size:*` label waiting for Board sync. */
export function needsSizing(labels: readonly string[], boardSize: string | undefined): boolean {
  return boardSize === undefined && !labels.some((l) => l.startsWith('size:'));
}

const ISSUE_QUERY = `query($number: Int!) {
  repository(owner: "itay28", name: "Military-TD") {
    issue(number: $number) {
      labels(first: 50) { nodes { name } }
      projectItems(first: 10) {
        nodes {
          project { number }
          size: fieldValueByName(name: "Size") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }
  }
}`;

interface IssueData {
  repository: {
    issue: {
      labels: { nodes: { name: string }[] };
      projectItems: { nodes: { project: { number: number }; size: { name?: string } | null }[] };
    } | null;
  };
}

// CLI: `node scripts/size-issue.ts <issue>`, with PROJECT_TOKEN (classic PAT, project + repo scopes).
// Prints the answer and writes `needed=true|false` to GITHUB_OUTPUT when it is set.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  const number = Number(process.argv[2]);
  if (!token || !Number.isInteger(number) || number < 1) {
    console.log('::error::Usage: PROJECT_TOKEN=… node scripts/size-issue.ts <issue number>');
    process.exitCode = 1;
  } else {
    const { issue } = (await graphql<IssueData>(token, ISSUE_QUERY, { number })).repository;
    if (!issue) throw new Error(`#${number}: no such issue`);
    const size = issue.projectItems.nodes.find((n) => n.project.number === PROJECT_NUMBER)?.size?.name;
    const needed = needsSizing(
      issue.labels.nodes.map((l) => l.name),
      size,
    );
    console.log(`#${number}: ${needed ? 'needs sizing' : `already sized (${size ?? 'size label'})`}`);
    if (process.env['GITHUB_OUTPUT']) appendFileSync(process.env['GITHUB_OUTPUT'], `needed=${needed}\n`);
  }
}
