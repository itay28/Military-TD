# Releasing

How versions are cut, deployed, and how milestones close. Issue work doesn't need this file; read it when touching release automation, the milestone report, or release issues. Commit types and the version effect of each are in `docs/agents/workflow.md` → **Commit types and versions**.

## Release PR and deploy
- **Release PR:** on every push to `main`, the *Release* workflow (`.github/workflows/release-please.yml`) runs release-please. It keeps one open release PR (`chore(main): release …`) that bumps `package.json`, `package-lock.json` and `.release-please-manifest.json` and updates `CHANGELOG.md` from the commits since the last release.
- **Release:** merging that PR tags `vX.Y.Z` and publishes a GitHub Release with the same notes. Nothing else releases: ordinary merges only update the release PR.
- **Who merges it:** the *PR steward* (`docs/agents/issue-tracker.md` → **PR steward**) merges the release PR only when its version is the current milestone's (`0.N.0`), so a milestone ships by itself once its report PR has merged (see **Milestone release**). A patch version (`0.1.2`) waits. Merge it by hand to ship a patch release at any time. To keep the steward off a release PR, add `hold`.
- **Config:** `release-please-config.json` (release type `node`, `bump-minor-pre-major`, `bump-patch-for-minor-pre-major`, tags without a component) and `.release-please-manifest.json` (the last released version). Guarded by `tests/release-config.test.ts`.
- **Version in the game:** `vite.config.ts` injects the `package.json` version as `__APP_VERSION__`; `src/data/version.ts` exposes it, and `src/ui/version.ts` writes it into the DOM overlay (`#version`, bottom-right corner; ADR-0003).
- **Deploy:** after a release, the `deploy` job in `release-please.yml` (`needs: release-please`, `if: needs.release-please.outputs.release_created == 'true'`) calls the reusable `.github/workflows/deploy.yml`, which builds the tag, runs `node scripts/itch-build.ts dist` and pushes `dist/` to itch.io with butler (ADR-0005). A Release created with `GITHUB_TOKEN` doesn't start other workflows, so don't use an `on: release` trigger. Redeploy a tag with **Actions → Deploy → Run workflow**. Setup and access: README → **Playing builds (itch.io)**. Guarded by `tests/deploy-workflow.test.ts`. The deploy runs inside the Release workflow, so a failed deploy turns that run red (the release is already out), and the next push to main waits in the `release-please` concurrency group until the deploy ends.
- **One-time setup (maintainer):** Settings → Actions → General → enable **Allow GitHub Actions to create and approve pull requests**. Optional: add a repo secret `RELEASE_PLEASE_TOKEN` (fine-grained PAT for this repo, Contents and Pull requests read/write) so CI and the PR-title check also run on the release PR and the milestone report PR. Without it they don't run there, because PRs opened with `GITHUB_TOKEN` don't start workflows. Add a repo secret `PROJECT_TOKEN` (classic PAT with `project` + `repo` scopes) so release issues move on the board (see **Milestone release**).

## Milestone release

Milestones can't be cards on the project board, so each milestone has a **release issue** that stands in for it: `Release v0.N.0`, in that milestone, labelled `release` + `area:infra`, a sub-issue of the infra epic (#24). Its body links the milestone. Nobody works on a release issue directly: it moves as the milestone does, and the **Releases** view on the board lists them all. It has no `ready-for-agent` label, so it is never picked as work and never promoted to *Ready*.

| Milestone moment | Release issue status | Moved by |
| --- | --- | --- |
| Planned, not started | Backlog | created there |
| First PR opened for an issue in the milestone | In progress | *Release board* workflow |
| Last issue in the milestone closed → milestone report PR opened | In review | *Milestone report* workflow (see **The milestone report PR**) |
| `v0.N.0` released | Done; milestone closed | `release-issue` job in the *Release* workflow |

**The automation.** The start and close steps run `scripts/release-board.ts` (decisions unit-tested in `tests/release-board.test.ts`, workflows guarded by `tests/release-board-workflow.test.ts`):
- **Start:** `.github/workflows/release-board.yml` runs on `pull_request: [opened, ready_for_review]`. If the PR closes an issue whose milestone's release issue is in *Backlog* or *Ready*, it moves that release issue to *In progress*. It needs the `PROJECT_TOKEN` secret (classic PAT, `project` + `repo` scopes), because `GITHUB_TOKEN` can't edit a user-owned project; without the secret the run warns and passes, and the card has to be moved by hand.
- **Close:** after release-please creates a release, the `release-issue` job in `release-please.yml` checks the tag. For a milestone version (`v0.N.0`, `vN.0.0`) it comments on the milestone's release issue with a link to the GitHub Release, closes it (the board's *Item closed* automation moves it to *Done*) and closes the milestone. The milestone is found by title (`v0.1.0 — MVP`). Patch releases do nothing. This uses `GITHUB_TOKEN`.
- **Check by hand:** `DRY_RUN=1 PROJECT_TOKEN=… node scripts/release-board.ts pr <n>` or `DRY_RUN=1 GITHUB_TOKEN=… node scripts/release-board.ts release <tag>` prints what would change.

**When is a milestone done?** When every issue in it is closed **except its release issue**. The release issue stays open until the release, so anything that checks whether a milestone is done (the report workflow, a human) ignores issues labelled `release`.

**The milestone report PR.** When the milestone's last other issue closes or is moved out of it, the *Milestone report* workflow (`.github/workflows/milestone-report.yml`, running `scripts/milestone-report.ts`) opens the milestone report PR from the branch `chore/release-0.N.0`:
- Title `chore: release 0.N.0`. It adds `docs/releases/0.N.0.md`, an audit of the milestone: **Planned** (every issue in it, with its outcome), **Delivered** (closed as completed, with the merged PRs that closed them), **Skipped** (closed as not planned or duplicate), **Moved out** (removed from the milestone during it and not back), **Added** (PRs merged since the previous milestone's release tag `vX.Y.0` that don't close an issue in the milestone; release-please's own release PRs are left out), and an empty **Notes** section. Patch tags in between don't count: the milestone started at the previous milestone's release.
- The body says `Refs #<release issue>`, not `Closes`: the release issue closes on the release itself. This is the one exception to "every PR closes an issue".
- The body ends with `Release-As: 0.N.0` as its own final paragraph: after the `🤖 Generated with …` line, with a blank line before it. Squash merge copies the PR body into the commit, and release-please reads `Release-As` only from the commit's last paragraph (the footer).
- If a report PR for the milestone is already open, the workflow commits the regenerated report to its branch instead (no force-push), keeping the Notes section and the PR body as they are. It can be re-run by hand: **Actions → Milestone report → Run workflow** with the milestone number. It does nothing when the milestone isn't done, `v0.N.0` is already tagged, or the report PR was already merged.
- When it opens the PR, it moves the release issue to *In review* with the `PROJECT_TOKEN` secret (see **Release PR and deploy** → one-time setup). Updates leave the card alone. Without the secret, or if the move fails, the run still opens the PR and ends with a warning: move the card by hand.
- Runs are queued one at a time per milestone; each one regenerates the whole report.
- It pushes and opens the PR with `RELEASE_PLEASE_TOKEN` when that secret exists, so CI runs on the report PR (see **Release PR and deploy** → one-time setup); otherwise with `GITHUB_TOKEN`, and CI doesn't start there.
- Preview the report for any milestone, done or not, without changing anything: `DRY_RUN=1 GITHUB_REPOSITORY=itay28/Military-TD MILESTONE=<n> node scripts/milestone-report.ts` (needs `gh` logged in). Guarded by `tests/milestone-report.test.ts` and `tests/milestone-report-workflow.test.ts`.

**The steward ships it (#187).** With `AUTO_MERGE` on, the *PR steward* takes it from here, with no human step:
1. **It merges the report PR** once `0.N.0` is the current milestone's version, the milestone is done (only its release issue is open), the body's last paragraph is `Release-As: 0.N.0`, and its checks are green. It doesn't wait for the CI review. The squash commit message is the PR body, passed explicitly, so the footer stays last and no `Co-authored-by:` lines follow it. release-please's release PR then switches to `0.N.0`. Editing the release PR's title or body does not change the version; its next run overwrites the edit.
2. **It merges the release PR** once that shows `0.N.0` and its checks are green. That tags `v0.N.0` and publishes the GitHub Release, and the `release-issue` job closes the release issue and the milestone.

**What the human can still decide.** Add `hold` to the report PR to stop the steward, then:
1. **Is the milestone really done?** Read the audit. Anything missing gets reopened, or moved to a later milestone on purpose; the report updates when the milestone closes out again.
2. **Notes:** write the Notes section of `docs/releases/0.N.0.md` on the report PR's branch (highlights, known issues, anything the changelog doesn't say).
3. **Remove `hold`** to let the steward merge both PRs, or merge them yourself. In the squash dialog, check the commit message still ends with `Release-As: 0.N.0` as its own paragraph: GitHub may add `Co-authored-by:` lines for the bot's commits after it; delete them, or release-please won't read the footer.

**Releasing early.** A patch release: merge the open release PR by hand. A milestone release before every issue is done: move the leftover issues to a later milestone; the report PR then opens and the steward ships it.

For `v1.0.0` it's the same, with `Release-As: 1.0.0`.

**Footer lost?** If the report PR merged but the release PR didn't switch (check the squash commit on `main`: `Co-authored-by:` lines after `Release-As` hide it), pin the version instead: a PR that adds `"release-as": "0.N.0"` to the package in `release-please-config.json`. Open the PR that removes the pin at the same time, and merge it as soon as `v0.N.0` ships, or every later release is forced to that version too. (A test can't catch a stale pin: the release PR itself bumps `package.json` to the pinned version.)

**When a run warns or fails**, do its step by hand: a *Release board* or *Milestone report* run that warned about a missing `PROJECT_TOKEN` (move the card; see **Project board** in `docs/agents/issue-tracker.md`), or a failed `release-issue` job (close the release issue and the milestone with a comment linking the GitHub Release).

**New milestone?** Create its release issue at the same time, as above, in *Backlog*.
