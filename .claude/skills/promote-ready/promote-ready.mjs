// Moves unblocked Backlog issues of one milestone to Ready on the project board.
// Usage: node promote-ready.mjs [--milestone <number|title|prefix>] [--dry-run]
import { boardIssues, parseArgs, resolveMilestone, setStatus, statusField } from '../_lib/board.mjs';

const args = parseArgs(process.argv.slice(2));
const milestone = resolveMilestone(args.milestone);
const dryRun = Boolean(args['dry-run']);

// Ready = current milestone, ready-for-agent, no open blockers, unassigned (docs/agents/issue-tracker.md).
const why = (i) => {
  if (!i.labels.includes('ready-for-agent')) return `not ready-for-agent (${i.labels.filter((l) => !l.startsWith('area:') && l !== 'enhancement').join(', ') || 'no triage label'})`;
  if (i.openBlockers > 0) return `blocked by ${i.openBlockers} open issue(s)`;
  if (i.assignees.length) return `assigned to ${i.assignees.join(', ')}`;
  return null;
};

const backlog = boardIssues().filter(
  (i) => i.state === 'OPEN' && i.status === 'Backlog' && i.milestone?.number === milestone.number,
);
const promote = backlog.filter((i) => !why(i));
const held = backlog.filter((i) => why(i));

console.log(`Milestone: ${milestone.title}${dryRun ? ' (dry run)' : ''}`);
if (promote.length) {
  const field = dryRun ? null : statusField();
  console.log(`\n${dryRun ? 'Would move' : 'Moved'} to Ready:`);
  for (const i of promote) {
    if (!dryRun) setStatus(field, i.itemId, 'Ready');
    console.log(`  #${i.number} ${i.title}`);
  }
} else {
  console.log('\nNothing to move to Ready.');
}
if (held.length) {
  console.log('\nStaying in Backlog:');
  for (const i of held) console.log(`  #${i.number} ${i.title} (${why(i)})`);
}
