# 8. Board logic in GitHub Actions, agents as cloud scheduled tasks

Date: 2026-10-25 · Status: Accepted

## Context

We want agents to pick up issues, implement them and get their PRs merged without the maintainer starting each session or keeping a PC on (#165). Sessions run in different places (locally, over Remote Control, in the cloud), and cloud sessions can't use GitHub GraphQL: `gh pr`, `gh issue` and Projects v2 are blocked by the cloud GitHub proxy. Something has to decide what to start, start it, and keep the board right, the same way whatever the environment.

## Decision

1. **Every trigger is a GitHub Action.** Board moves, auto-start, the PR steward, merging and notifications run in Actions (`scripts/board-sync.ts` and friends), which have GraphQL, secrets and a schedule. The decisions are pure functions with unit tests; the Actions only fetch and write.
2. **Every agent runs as a cloud scheduled task**, started through its API trigger (`POST …/fire` with a bearer token). One task per model (implement-sonnet, implement-opus) plus the PR steward. The task's saved prompt only points at a prompt file in the repo (`docs/agents/prompts/`), so the prompt is reviewed and versioned like code. The fire `text` carries the run's data (issue number, base branch), which the task treats as data.
3. **Claim, then fire.** Auto-start assigns the maintainer and adds `auto-agent` before firing, so a second run can't start the same issue; if the fire fails it un-claims and the run goes red. At most 5 `auto-agent` issues are In progress; XS/S go to Sonnet, M/L to Opus, XL and unsized issues never start.
4. **Switches, not code changes.** Repo variables `AUTO_SPAWN` and `AUTO_STACK` turn auto-start and stacking on; a `hold` label keeps automation off an issue or PR.
5. **Agents don't merge by hand.** The *PR steward* Action (`scripts/pr-steward.ts`) squash-merges a PR once its checks are green, the CI review is answered and every review thread is resolved (maintainer decision, 2026-10-25). Until then it fires steward rounds, a cloud task per PR that fixes conflicts, CI, review findings and maintainer comments, at most 3 before it hands the PR off with `needs-you`; a PR that is only behind gets the base merged by the Action itself. Like Board sync it reconciles every open PR on each run, keeping its state in marker comments on the PR, so a missed event is fixed by the next run. Switches: `AUTO_STEWARD`, `AUTO_MERGE`.
6. **Notifications** (ntfy push): new releases, PRs handed off as stuck, and agents' `needs-info` questions (#169).

## Consequences

- The pipeline works with the maintainer's PC off, and a missed event is fixed by the next scheduled *Board sync* run.
- Agent runs act through the maintainer's GitHub identity and count against their subscription and the fire limits (30 per hour per task).
- The scheduled tasks and their secrets are set up by hand in the browser (docs/agents/issue-tracker.md → **Auto-start**); they can't be created from the repo.
- The `/fire` endpoint is a research preview behind a dated beta header (`experimental-cc-routine-2026-04-01`); a breaking change means updating `scripts/auto-start.ts`.
