# Workflow

How every change gets made, by agents and humans alike. The rules are short; follow them in order.

**Skills:** this repo uses **Matt Pocock's skills only** (`mattpocock-skills`, from github.com/mattpocock/skills). Don't use skills from other plugins that cover the same ground (e.g. `agent-engineering:*`, or `engineering:*` from Anthropic's engineering plugin), and prefer `mattpocock-skills:code-review` over the built-in `/code-review`.

## Ground rules

1. **Plan before code.** Decide the architecture (modules, interfaces, data shapes, where the test seams are) before writing anything.
2. **Tests before implementation.** Write failing tests at the agreed seams, then write the code that makes them pass (red → green → refactor).
3. **No human needed to verify.** Every behaviour must be checkable by a command: unit tests, scenario runs, or Playwright. If something can only be checked by playing, add the test hook that makes it checkable.
4. **The Simulation owns the rules.** Game logic goes in `src/sim` (no Phaser, no `Math.random`/`Date.now`). Scenes and UI only draw and forward input. See ADR-0002.
5. **Small PRs, one issue each**, with CI green before merge.
6. **Every third-party asset is tracked** in `assets/manifest.json` before it's committed. See `docs/assets.md`.

## Which skill when

| Situation | Skill |
| --- | --- |
| New issues or `needs-triage` issues to sort, label, and turn into agent-ready briefs | `/triage` |
| A design question or fuzzy feature to sharpen (updates GLOSSARY and ADRs as it goes) | `/grill-with-docs` |
| Turn a discussion into a spec issue | `/to-spec` |
| Split a spec or plan into tickets with blocking links | `/to-tickets` |
| A large area needing many decisions first (e.g. a whole milestone) | `/wayfinder` |
| Implement one ready issue | `/implement` (drives `tdd` at agreed seams, finishes with `code-review`) |
| Implement a whole spec's tickets on one branch | `/implement-spec` |
| Interface or module design | `codebase-design` |
| Try out a UI or mechanic before committing to it | `prototype` |
| A hard bug or performance problem | `diagnosing-bugs` |
| Write the PR body | `pr` |
| After a session: improve the agent setup | `/retro` |
| Not sure which | `/ask-matt` |

## Steps for one issue

### 0. Pick
- Pick an open issue in the **current milestone** with `ready-for-agent`, no open blockers, and no assignee. The order in `docs/PLAN.md` helps.
- Assign yourself. Move it to *In progress* on the project board (see **Project board** in `docs/agents/issue-tracker.md`).
- No issue for the work yet? Create one first, under the right epic with its area label and milestone. Every PR closes an issue.
- `needs-triage` issues get planned first (step 1, via `/triage` or `/grill-with-docs`), then relabelled `ready-for-agent`. Don't implement them directly.

### 0b. Open a session tracker
Every working session gets a **session tracker**: a live page that follows the work.
- **Where:** an Artifact page published with Claude's Artifact tool, created at the start of the session. Sessions without the Artifact tool (e.g. `@claude` in GitHub Actions) keep the same content as a pinned comment on the issue instead.
- **Contents:**
  - links to the issue(s) and, once it exists, the PR;
  - **what** is being built and **why** (the goal, in two or three sentences);
  - the plan (from step 1);
  - a short progress log with timestamps;
  - current status and any blockers or open questions.
- **Updates:** update it at each milestone of the session (plan agreed, tests red, tests green, PR opened, review done), and link it in the first progress comment on the issue.

### 1. Plan (comment on the issue)
Post a short plan as an issue comment before writing code:
- **Modules and interfaces** touched or added, with signatures.
- **Seams to test**: the public interfaces the tests will go through, and what each one catches.
- **Test list**: the test names, written as behaviour ("tower ignores enemies out of range").
- **Decisions**: anything hard to reverse becomes an ADR in `docs/adr/`. New domain terms go in `GLOSSARY.md`.

The `tdd` skill asks for seams to be agreed before tests are written. For a `ready-for-agent` issue, this plan comment is that agreement: a plan inside the acceptance criteria can proceed. One that changes scope needs a human (comment and add `needs-info`).

### Keep the issue up to date (throughout)
- **Progress comments:** comment on the issue at each meaningful step: plan posted, tests written (red), implementation green, PR opened, review feedback addressed, blockers hit. Keep each comment short: what happened, what's next.
- **Edit the description when the idea changes:** if the approach, flow, scope or acceptance criteria change in a significant way, update the issue description itself so it stays the source of truth. Add a dated "Changed:" note at the bottom saying what changed and why. Minor details stay in comments.

### 2. Tests first
- Write the tests from the list. Run them and confirm they **fail for the right reason**.
- Pick the cheapest layer that proves the behaviour (see ADR-0003):
  - **Unit** (Vitest) for one sim module.
  - **Scenario** (`tests/scenarios/*.scenario.ts`) for game situations: setup → run headless → assert outcome and events.
  - **E2E** (Playwright, `tests/e2e`) for anything the player sees or clicks.

### 3. Implement
- Write the minimum code to go green, then refactor with tests green.
- Match the existing code style; keep tuning numbers in `src/data`.

### 4. Verify
- `npm run check` (typecheck, lint, format check, unit and scenario tests) and `npm run test:e2e` when UI is touched.
- For gameplay changes, also run the relevant scenario with `npm run scenario -- <name>` and read the outcome.
- `mattpocock-skills:code-review` against `main` before marking the PR ready.

### 5. PR
- Branch: `<type>/<issue>-<slug>`, e.g. `feat/8-tower-targeting`.
- PR title in Conventional Commit form (it becomes the squash commit and drives the version bump): `feat: tower targeting and firing`.
- Body via the `pr` skill, with `Closes #<n>` and the template checklist.
- **Draft vs ready:** open the PR as a draft while work is still in progress. As soon as it's complete (acceptance criteria met, checks green, review done), mark it ready for review (`gh pr ready <n>`) and say so on the issue. Never leave a finished PR in draft.
- **Automatic review:** marking the PR ready starts the *Claude Code Review* workflow, which runs `mattpocock-skills:code-review` and posts a Standards / Spec report as a PR comment. It runs again on each push while the PR is ready, and skips drafts. Address its findings or say on the PR why not.
- **Board:** linking the PR moves the issue to *In review*; merging it (or closing the issue) moves it to *Done*. These are automatic; fix the card by hand only if an automation missed it.
- Squash-merge when CI is green. Never push to `main` directly.

## Definition of done
- [ ] Acceptance criteria met
- [ ] Issue has progress comments; description updated if the idea changed
- [ ] Session tracker shows the final status and the PR link
- [ ] Tests written first, now passing; new behaviour covered at the right layer
- [ ] `npm run check` green locally and in CI (plus e2e if UI changed)
- [ ] No game rules outside `src/sim`; no Phaser in `src/sim`
- [ ] New assets recorded in `assets/manifest.json`
- [ ] Docs updated if behaviour, terms or decisions changed (PLAN, GLOSSARY, ADR)
- [ ] PR title is a Conventional Commit; body says `Closes #n` (the one exception: a milestone report PR says `Refs #<release issue>`; see **Milestone release**)

## Commit types and versions

| Type | Use for | Version effect before 1.0 | After 1.0 |
| --- | --- | --- | --- |
| `feat:` | New player-visible feature or content | patch | minor |
| `fix:` | Bug fix | patch | patch |
| `feat!:` / `BREAKING CHANGE:` | Breaks saves/settings or a big notable change | minor | major |
| `test:` `refactor:` `chore:` `ci:` `docs:` | Everything else | none | none |

A milestone ends with a release of the next minor version (`0.N.0`) through a `Release-As: 0.N.0` commit footer, carried by the milestone report PR; see **Milestone release** below and ADR-0004.

PR titles are checked by the *PR title* workflow (`.github/workflows/pr-title.yml`, rule in `scripts/pr-title.ts`). PRs are squash-merged with the PR title as the commit subject and the PR body as the commit body, so the title is what release-please reads. (`pr-title` isn't a required status check, so a red title doesn't block the merge button; fix it before merging.)

## Releasing
- **Release PR:** on every push to `main`, the *Release* workflow (`.github/workflows/release-please.yml`) runs release-please. It keeps one open release PR (`chore(main): release …`) that bumps `package.json`, `package-lock.json` and `.release-please-manifest.json` and updates `CHANGELOG.md` from the commits since the last release.
- **Release:** merging that PR tags `vX.Y.Z` and publishes a GitHub Release with the same notes. Nothing else releases: ordinary merges only update the release PR.
- **Config:** `release-please-config.json` (release type `node`, `bump-minor-pre-major`, `bump-patch-for-minor-pre-major`, tags without a component) and `.release-please-manifest.json` (the last released version). Guarded by `tests/release-config.test.ts`.
- **Version in the game:** `vite.config.ts` injects the `package.json` version as `__APP_VERSION__`; `src/data/version.ts` exposes it, and `src/ui/version.ts` writes it into the DOM overlay (`#version`, bottom-right corner; ADR-0003).
- **Deploy:** after a release, the `deploy` job in `release-please.yml` (`needs: release-please`, `if: needs.release-please.outputs.release_created == 'true'`) calls the reusable `.github/workflows/deploy.yml`, which builds the tag, runs `node scripts/itch-build.ts dist` and pushes `dist/` to itch.io with butler (ADR-0005). A Release created with `GITHUB_TOKEN` doesn't start other workflows, so don't use an `on: release` trigger. Redeploy a tag with **Actions → Deploy → Run workflow**. Setup and access: README → **Playing builds (itch.io)**. Guarded by `tests/deploy-workflow.test.ts`. The deploy runs inside the Release workflow, so a failed deploy turns that run red (the release is already out), and the next push to main waits in the `release-please` concurrency group until the deploy ends.
- **One-time setup (maintainer):** Settings → Actions → General → enable **Allow GitHub Actions to create and approve pull requests**. Optional: add a repo secret `RELEASE_PLEASE_TOKEN` (fine-grained PAT for this repo, Contents and Pull requests read/write) so CI and the PR-title check also run on the release PR. Without it they don't run there, because PRs opened with `GITHUB_TOKEN` don't start workflows.

## Milestone release

Milestones can't be cards on the project board, so each milestone has a **release issue** that stands in for it: `Release v0.N.0`, in that milestone, labelled `release` + `area:infra`, a sub-issue of the infra epic (#24). Its body links the milestone. Nobody works on a release issue directly: it moves as the milestone does, and the **Releases** view on the board lists them all. It has no `ready-for-agent` label, so it is never picked as work and never promoted to *Ready*.

| Milestone moment | Release issue status | Moved by |
| --- | --- | --- |
| Planned, not started | Backlog | created there |
| First PR opened for an issue in the milestone | In progress | by hand until #97 lands |
| Last issue in the milestone closed → milestone report PR opened | In review | by hand until #96 lands |
| `v0.N.0` released | Done; milestone closed | by hand until #97 lands |

**When is a milestone done?** When every issue in it is closed **except its release issue**. The release issue stays open until the release, so anything that checks whether a milestone is done (the report workflow, a human) ignores issues labelled `release`.

**The milestone report PR.** When the milestone's last other issue closes, a workflow (#96) opens the milestone report PR:
- Title `chore: release 0.N.0`. It adds `docs/releases/0.N.0.md`, an audit of the milestone: **Planned** (every issue in it), **Delivered** (closed as completed, with the PRs that closed them), **Skipped** (closed as not planned), **Moved out** (removed from the milestone during it), **Added** (merged PRs since the last `v0.(N-1).*` tag that don't close an issue in the milestone), and an empty **Notes** section.
- The body says `Refs #<release issue>`, not `Closes`: the release issue closes on the release itself. This is the one exception to "every PR closes an issue".
- The body ends with `Release-As: 0.N.0` as its own final paragraph: after the `🤖 Generated with …` line, with a blank line before it. Squash merge copies the PR body into the commit, and release-please reads `Release-As` only from the commit's last paragraph (the footer).
- If a report PR for the milestone is already open, the workflow updates it instead. It can be re-run by hand (`workflow_dispatch` with the milestone).

**What the human decides.**
1. **Is the milestone really done?** Read the audit. Anything missing gets reopened, or moved to a later milestone on purpose; the report updates when the milestone closes out again.
2. **Notes:** write the Notes section (highlights, known issues, anything the changelog doesn't say).
3. **Merge the report PR.** release-please's release PR then switches to `0.N.0`. Editing the release PR's title or body does not change the version; its next run overwrites the edit.
4. **Merge the release PR** when you want to ship. That tags `v0.N.0` and publishes the GitHub Release, and #97 closes the release issue and the milestone.

For `v1.0.0` it's the same, with `Release-As: 1.0.0`.

**Until #96 and #97 land**, do their steps by hand: move the release issue on the board (see **Project board** in `docs/agents/issue-tracker.md`), open the report PR yourself with the same title, file, `Refs` line and footer, and after the release close the release issue and the milestone with a comment linking the GitHub Release.

**New milestone?** Create its release issue at the same time, as above, in *Backlog*.
