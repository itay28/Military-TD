# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Project board

Status lives on the **Military-TD Roadmap** project: https://github.com/users/itay28/projects/4 (owner `itay28`, number `4`).

**Status columns**

| Status | Means |
| --- | --- |
| Backlog | Not startable yet: open blockers, or a later milestone |
| Ready | Current milestone, `ready-for-agent`, no open blockers, unassigned |
| In progress | Someone is working on it (assigned), including while its PR is a draft |
| In review | A PR that closes it is ready for review (not a draft) |
| Done | Closed |

**Other fields:** Area (`core`, `towers`, `units`, `ui`, `art`, `infra`, matching the `area:*` label), Priority and Size, as defined below. Set all three on new issues.

**Priority**: how much the issue matters to its milestone. Judge it against the milestone, not the whole game.

| Priority | Means |
| --- | --- |
| P0 | Urgent: the build, CI, a release or the game is broken, or it blocks most other Ready work. Do it before anything else |
| P1 | Needed: the milestone can't ship without it |
| P2 | Wanted: makes the milestone better, but it can ship without it |
| P3 | Someday: polish or ideas with no milestone commitment. Fine to leave in Backlog indefinitely |

**Size**: how much work one agent session needs, counting tests and docs.

| Size | Means |
| --- | --- |
| XS | Minutes: a one-line fix, a typo, a config value |
| S | Under an hour or two: one small change in one area, a few tests |
| M | Up to about a day: a feature slice touching a few files, with new tests |
| L | Several days, or several areas or systems at once. Consider splitting |
| XL | Too big for one PR. Split into sub-issues before it goes to Ready; never start an XL issue as is |

When unsure between two levels, pick the bigger Size and the less urgent Priority.

**Automations** (project ⋯ → Workflows):
- Auto-add: open issues in this repo, and sub-issues, land on the board on their own.
- Item closed, PR merged → *Done*.
- *Pull request linked to issue* is **off on purpose**: it moves the card when a draft PR is opened, which is too early. No built-in workflow fires on "ready for review".

**Board sync** (`.github/workflows/board-sync.yml` → `scripts/board-sync.ts`): a GitHub Action, so it works the same whether a session runs locally, over Remote Control, in the cloud, or the change comes from the GitHub UI. It runs on every PR open/edit/ready/draft/close, on issue assign/reopen, every 6 hours, and on demand (Actions → *Board sync* → Run workflow). Each run reconciles every open issue on the board:

| The issue has | Card goes to |
| --- | --- |
| an open PR ready for review, or a stacked PR merged into its parent branch | *In review* |
| only draft PRs, or no PR but an assignee | *In progress* |
| no PR, no assignee | stays where it is |

"Closes" means GitHub's link **or** `Closes/Fixes/Resolves #n` in the PR body: GitHub only links PRs that target `main`, so stacked PRs rely on the body. *Done* cards and release issues are never touched. It uses the `PROJECT_TOKEN` secret; a missing token or an API error fails the run, so a board that isn't syncing shows up red. Check by hand: `PROJECT_TOKEN=… node scripts/board-sync.ts --dry-run`.

So agents move cards by hand only:
- **Unblocked** issue: Backlog → *Ready* (`/workflow:promote-ready`).
- **Release issues**: only if a run warned or failed. Every move is a GitHub Action (see **Milestone release** in `docs/agents/releasing.md`).
- To fix a card when a *Board sync* run failed; or re-run it.

**Release issues** (label `release`) are the exception to the Status definitions above. Each one stands in for its milestone (milestones can't be cards) and moves with the milestone, not with assignees or closing PRs; see **Milestone release** in `docs/agents/releasing.md`. They have Area `infra` and no Priority or Size (they're trackers, not work), and no `ready-for-agent`, so they never go to *Ready*. The **Releases** view (filter `label:release`) shows them with their Status and Milestone. The other views include them.

**Token:** the repo's `gh` login is a fine-grained token scoped to this repo, and fine-grained tokens can't edit user-owned Projects. Board edits need a classic token with `project` and `repo` scopes, passed only for that call via `GH_TOKEN`. Never print or commit it. If you don't have one, ask the human; don't skip the board update silently. Status moves don't need it any more (*Board sync* does them); setting Area, Priority and Size on new issues still does. Where each environment gets it: `docs/agents/tooling.md` → **Environments**.

```sh
# with GH_TOKEN set to the classic token
gh project field-list 4 --owner itay28 --format json            # field and option ids
gh project item-add 4 --owner itay28 --url <issue-url> --format json   # returns the item id; safe to repeat
gh project item-edit --project-id <project-id> --id <item-id> \
  --field-id <status-field-id> --single-select-option-id <option-id>
```

`gh project view 4 --owner itay28 --format json` gives the project id.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
