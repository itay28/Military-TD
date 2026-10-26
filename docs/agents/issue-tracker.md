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

**Board sync** (`.github/workflows/board-sync.yml` → `scripts/board-sync.ts`): a GitHub Action, so it works the same whether a session runs locally, over Remote Control, in the cloud, or the change comes from the GitHub UI. It runs on every PR open/edit/ready/draft/close, on issue assign/reopen/close/label/milestone changes, every 6 hours (which also catches "blocked by" edits, which have no event), and on demand (Actions → *Board sync* → Run workflow). Each run reconciles every open issue on the board:

| The issue has | Card goes to |
| --- | --- |
| an open PR ready for review, or a stacked PR merged into its parent branch | *In review* |
| only draft PRs, or no PR but an assignee | *In progress* |
| no PR, no assignee, card in *Backlog*/*Ready*/none: current milestone + `ready-for-agent` + no open blockers | *Ready* |
| the same, when any of those three doesn't hold | *Backlog* |
| no PR, no assignee, card *In progress*/*In review* | stays where it is |

The current milestone is the open one with the earliest due date, else the lowest version.

"Closes" means GitHub's link **or** `Closes/Fixes/Resolves #n` in the PR body: GitHub only links PRs that target `main`, so stacked PRs rely on the body. *Done* cards and trackers (release issues, epics) are never touched. It uses the `PROJECT_TOKEN` secret; a missing token or an API error fails the run, so a board that isn't syncing shows up red. Check by hand: `PROJECT_TOKEN=… node scripts/board-sync.ts --dry-run`.

**Auto-start** (`scripts/auto-start.ts`, ADR-0008): when the repo variable `AUTO_SPAWN` is `on`, each *Board sync* run then starts cloud agents:
- **Startable:** no PR, no assignee, `ready-for-agent`, no `hold` label, not a tracker, Size XS–L, no open blockers. In the current milestone that's the *Ready* column. With `AUTO_STACK` set to `on`, an issue whose open blockers are all closed by open PRs on one chain of branches (the stack-next rule) is startable too, based on the chain's tip branch.
- **Order and cap:** Priority (P0 first, none last), then issue number; at most 5 `auto-agent` issues *In progress*. When the current milestone has nothing startable, the next milestone's issues are used.
- **Claim, then fire:** assign `itay28`, add `auto-agent`, then fire the implement scheduled task (XS/S → `ROUTINE_SONNET_*`, M/L → `ROUTINE_OPUS_*`) with the issue number and base branch. If the fire fails, the claim is undone. A temporary refusal (HTTP 429, a 5xx or no answer: usage or rate limit) is quiet: the run stays green, auto-start stops for this run, and a later run tries again. Any other refusal (a bad token, a deleted routine) also adds `needs-you` and a comment to the issue, which pushes to the maintainer, and the run goes red; the issue isn't started again until `needs-you` is removed (#200). The task follows `docs/agents/prompts/implement.md`.
- **No Size:** one comment on the issue asking for one; it starts once Size is set. XL never starts: split it.
- **Off switch:** set `AUTO_SPAWN` to anything but `on`, or add `hold` to one issue. `--dry-run` logs what it would start.
- **Setup errors:** with `AUTO_SPAWN` on and a `ROUTINE_*` secret missing, the board still syncs but auto-start is skipped and the run goes red.

**Auto-start setup** (maintainer, once, in the browser). The two scheduled tasks `implement-sonnet` (model Sonnet) and `implement-opus` (model Opus) already exist at [claude.ai/code/routines](https://claude.ai/code/routines), disabled. Their prompt is: *Read `docs/agents/prompts/implement.md` in the itay28/Military-TD repository and follow it. The issue number and base branch to use are in the `<routine-fire-payload>` block of this message; act on them.* For each one:
1. **Edit**: under Repository, add `itay28/Military-TD`; keep your usual cloud environment; add the GitHub connector if your account has one. Don't skip this: a routine made through the API or by an agent starts with no repository, and only the browser can add one. Without it, the fire succeeds and the Action stays green, but the session can't clone or call GitHub (403) and exits after a push notification; the doctor's *no GitHub access* line names it.
2. **Trigger → + → API**: copy the **Fire URL**, click **Generate token**, and copy the token (shown once).
3. In GitHub → Settings → Secrets and variables → Actions → **Secrets**, add `ROUTINE_SONNET_URL` / `ROUTINE_SONNET_TOKEN` (or `ROUTINE_OPUS_…`) with those two values. The token can only start that one task: it has no GitHub or account access. Claims and comments use the existing `PROJECT_TOKEN`.
4. Turn the task on.

Then set the variable `AUTO_SPAWN` = `on` (and `AUTO_STACK` = `on` to stack), and check with Actions → *Board sync* → Run workflow; the log's auto-start lines say what started. Each start opens a session in the task's **History**.

**PR steward** (`.github/workflows/pr-steward.yml` → `scripts/pr-steward.ts`, ADR-0008): gets each PR to merged. It runs after CI and the CI review finish, on every PR comment and review, on each push to `main`, every hour and on demand, and looks at every open PR:

| The PR | Steward does |
| --- | --- |
| draft, from a fork, labelled `hold`, or `needs-you` with no maintainer comment since the hand-off | nothing |
| mergeability still computing, a round in flight (no done marker yet, under 1 h old), or checks running (CI, CI review) | waits |
| a conflict, a failing check, a CI review or maintainer comment newer than the last done marker, or unresolved review threads | fires a **round** of the `pr-steward` task, which fixes what it can and ends with a `<!-- pr-steward:done -->` comment |
| the same, after 3 rounds since the latest maintainer comment, or a conflict a round couldn't resolve | hands off: `needs-you` label + a summary comment |
| the steward's trigger refuses the fire with a setup error (any 4xx but 429: bad token, deleted routine) | hands off the same way, naming the HTTP status and the secrets to check; the run goes red |
| only behind its base | merges the base in itself (no agent, not a round) |
| no CI review comment yet | waits (add `review-again` to request one) |
| closes an issue that is still blocked by open issues, or labelled `needs-info` | waits |
| closes an issue in a later milestone than the current one (auto-start's look-ahead) | waits until the current milestone ships (its release closes the milestone); rounds still run |
| green, review answered, threads resolved, targets `main`, but it changes a **critical path** (#206) and no maintainer `/approve` came after both the latest round and the latest commit that isn't a merge | hands off for approval: `needs-you` + a comment listing the paths. Comment `/approve` to merge it, or comment what to change (that fires a round, and it asks again after). Critical paths (`CRITICAL_PATHS` in `scripts/pr-steward.ts`): the pipeline and the checks that gate merging (`.github/`, `.claude/`, `.husky/`, `CLAUDE.md`, `docs/agents/`, `scripts/` except `scenario.ts` and `itch-build.ts`, the lint/TS/Vite/Playwright configs), the release-please config and manifest, `docs/adr/`, `package.json` and its lockfile, `assets/manifest.json` and `LICENSE`; a renamed file (its old path is unknown) and a PR with more than 100 files count too |
| green, review answered, threads resolved, targets `main` | squash-merges it with the PR title (+ ` (#n)`) and body; if GitHub refuses, hands off |
| release-please's release PR | no rounds and no review needed. It merges only when its version is the current milestone's (`v0.2.0 — …` → `release 0.2.0`), once its checks are green; merging publishes the release, and the release push tells you. A patch release (`release 0.1.2`) waits for you to merge it by hand (#187). Its checks only run with the `RELEASE_PLEASE_TOKEN` secret (`docs/agents/releasing.md`); without it, it waits for you |
| the milestone report PR (`chore/release-0.N.0`) | no rounds and no review needed: merges once `0.N.0` is the current milestone's version, the milestone is done (only its release issue is open), the body ends with `Release-As: 0.N.0` and its checks are green. The squash commit message is the PR body, so the footer stays last. Add `hold` to read the audit and write Notes first |

- Stacked PRs are stewarded but merged only once GitHub retargets them to `main` (after their parent merges).
- **Out of tokens is never a failure (#200).** A round whose session ends without its done marker (most likely the usage limit) is retried once it's 1 h old, as the same round number, and never counts toward the 3; nor does the conflict hand-off look at it. A fire refused for now (HTTP 429, a 5xx or no answer) posts nothing and counts nothing: the next run (at least hourly) fires it again, and the run stays green. A session with no GitHub access isn't counted either, but it pushes to the maintainer itself (prompt step 0) each time it's retried.
- A round fired only for a conflict doesn't count toward the 3: conflicts come from the base moving (a PR below it merged), not from a failed attempt. If a round fired for a conflict (alone or together with other reasons) ends with the conflict still there on the same base, the agent couldn't resolve it, so the PR is handed off at once (`needs-you`). The round marker carries a hidden `<!-- pr-steward:round-meta reasons=… base=<sha> -->` line for this.
- Each check counts by its latest run: a cancelled run is ignored once another run of the same check finished (a re-triggered `pr-title` cancels its older run). A check whose only run was cancelled counts as failing.
- Checks that don't test the code are ignored: `board-sync`, `release-issue`, and `claude-review` (the review counts by its comment).
- State lives in comments on the PR: `<!-- pr-steward:round -->` (round fired, with the session link), `<!-- pr-steward:done -->` (round finished), `<!-- pr-steward:stuck -->` (handed off). A **maintainer comment** is one by the owner or a collaborator without a marker and without the *Generated by Claude Code* footer. Agents post as the maintainer's identity, so they must sign with the footer. A maintainer comment gives the PR 3 fresh rounds and takes a handed-off PR back; one that starts with `/approve` fires no round, it only approves a PR that changes a critical path. Agents never post `/approve`.
- **Switches** (repo variables, off unless `on`): `AUTO_STEWARD` fires rounds, updates branches and hands off; `AUTO_MERGE` merges. Off, each run only logs what it would do. `hold` keeps one PR out.
- The implement agent stops once its PR is ready; the CI review is the steward's first round.
- Check by hand: `PROJECT_TOKEN=… node scripts/pr-steward.ts --dry-run`.

**PR steward setup** (maintainer, once). The scheduled task `pr-steward` (model Sonnet) exists at [claude.ai/code/routines](https://claude.ai/code/routines), disabled, with the prompt *Read `docs/agents/prompts/pr-steward.md` in the itay28/Military-TD repository and follow it. The PR number and reasons are in the `<routine-fire-payload>` block of this message; act on them.* As for the implement tasks: add the repository (and the GitHub connector), add an **API** trigger, and save its Fire URL and token as the secrets `ROUTINE_STEWARD_URL` and `ROUTINE_STEWARD_TOKEN`. Turn the task on, then set `AUTO_STEWARD` = `on`, and `AUTO_MERGE` = `on` when you want merging. `main`'s branch protection must not require an approving review, or every merge is refused and handed off.

So agents move cards by hand only:
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

## Hand-off

The maintainer isn't watching the board. They get an [ntfy](https://ntfy.sh) phone push when they're needed, and the **Needs you** board view (filter `label:needs-you,needs-info`) lists what's waiting on them.

| Push | When | Clicks through to |
| --- | --- | --- |
| *Military-TD vX.Y.Z released*, with the changelog link | release-please publishes a release (`notify` job in `release-please.yml`) | the GitHub Release |
| *PR #n needs your approval*, with the paths | a PR that changes a critical path is otherwise ready to merge (#206); comment `/approve` | the PR |
| *PR #n is stuck*, with the steward's summary | a PR gets `needs-you`: the PR steward gave up after 3 rounds, or its trigger has a setup error | the PR |
| *Issue #n needs you*, with auto-start's summary | an issue gets `needs-you`: auto-start's trigger has a setup error (#200) | the issue |
| *Question on #n*, with the issue title | an issue gets `needs-info`: an agent asked a question (`docs/agents/prompts/implement.md`) | the issue |

- **Labels:** `needs-you` goes on a stuck PR or an issue auto-start couldn't start, `needs-info` on an issue with an open question. Removing the label takes the item out of the view. `hold` on the item means no push.
- **Steward summary:** the PR steward posts its summary as a PR comment that starts with `<!-- pr-steward:stuck -->`, then adds `needs-you`; auto-start does the same on an issue with `<!-- auto-start:stuck -->`. The push carries the latest such comment, or the title when there's none.
- **How:** `.github/workflows/notify.yml` runs on those labels; logic and tests in `scripts/notify.ts`. Labels added with `GITHUB_TOKEN` don't start workflows, so an Action that labels that way runs `node scripts/notify.ts pr <n>` (or `issue <n>`) itself. A missing `NTFY_TOPIC` secret or an ntfy error fails the run.

**Hand-off setup** (maintainer, once):
1. Pick a long random topic name (it's the only secret: anyone who knows it can read and send), e.g. `openssl rand -hex 16` → `mtd-<hex>`.
2. GitHub → Settings → Secrets and variables → Actions → **Secrets**: add `NTFY_TOPIC` with that name.
3. Install the ntfy app (Android or iOS), tap **+**, and subscribe to that topic on `ntfy.sh`.
4. Project board → **New view** (table) named **Needs you**, filter `label:needs-you,needs-info`.
5. Check: Actions → *Notify* runs when you add `needs-info` to a test issue; the phone shows *Question on #n*.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
