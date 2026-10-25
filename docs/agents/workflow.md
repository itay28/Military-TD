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
| Implement one ready issue | `/implement` (drives `tdd` at agreed seams; skip its closing `code-review`: CI reviews the PR, see step 5) |
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
- **Where:** an Artifact page published with Claude's Artifact tool. Start from the template, `docs/agents/session-tracker.html`: copy it to the session's scratch folder, fill in the placeholders, and publish it. It already meets the Artifact page rules, so skip the Artifact quickstart and design pass. Sessions without the Artifact tool (e.g. `@claude` in GitHub Actions) keep the same content as a pinned comment on the issue instead.
- **Contents:**
  - links to the issue(s) and, once it exists, the PR;
  - **what** is being built and **why** (the goal, in two or three sentences);
  - the plan (from step 1);
  - a short progress log with timestamps;
  - current status and any blockers or open questions;
  - for UI changes, the screenshots from step 4b.
- **Updates:** publish it three times: when the plan is posted, when the PR is marked ready (with screenshots), and when the session ends (final status). Each update is one publish with `edits`, and the log gets one line per step in between. Link it in the first progress comment on the issue.

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
    A file is `export default defineScenario({ description, ...setup, script, until, expectations(result, expect) { ... } })` (`tests/scenarios/define.ts`; setup and stop conditions: `Scenario` in `src/sim/scenario.ts`). `tests/scenarios/scenarios.test.ts` runs every file, checks its expectations and that two runs give the same event log. `npm run scenario -- <name>` prints the outcome, final Lives/Money and a timeline; add `--json` (with `npm run -s`) for the full run.
  - **E2E** (Playwright, `tests/e2e/*.spec.ts`) for anything the player sees or clicks. `npm run test:e2e` builds the game, serves it with `vite preview` and runs the specs in headless Chromium (first time: `npx playwright install chromium`). Open the game with `openGame(page)` from `tests/e2e/helpers.ts`. It turns on test mode: `?test=1` exposes `window.__TD__` with `state()`, `command(cmd)`, `step(ticks)`, `loadScenario(name)` and `view()` (what the canvas shows: range ring, tracers, draw order; poll it with `expect.poll`, it updates on the next frame), and it also sets `?step=manual` (only `step` advances the game) and `?anim=0` (no tracers or floating texts). `?speed=N` runs the real-time loop N× faster. Click the canvas like a player with `clickTile(page, tile)`, and use `stepToEnd(page)` to reach Victory or Defeat without waiting. `loadScenario` sets up a named scenario's map, Lives, Money, towers and waves but doesn't run its script, so the test drives from there.
  - **Screenshot baselines** (`toHaveScreenshot`, in `tests/e2e/screenshots.spec.ts`) run only when `CI` is set, so only in the CI `e2e` job's Playwright container, where fonts and rendering are fixed. To add or update one: push, let the `e2e` job fail, download its `playwright-report` artifact (`gh run download <run-id> -n playwright-report`), check the `*-actual.png` image, and commit it as `tests/e2e/screenshots.spec.ts-snapshots/<name>.png`. Never commit a baseline made on your own machine.

### 3. Implement
- Write the minimum code to go green, then refactor with tests green.
- Match the existing code style; keep tuning numbers in `src/data`.

### 4. Verify
- `npm run check` (typecheck, lint, format check, unit and scenario tests) and `npm run test:e2e` when UI is touched.
- For gameplay changes, also run the relevant scenario with `npm run scenario -- <name>` and read the outcome.

### 4b. Screenshots for UI changes
A PR that changes what the player sees (HUD, menus, overlays, anything a Scene draws) shows the change in screenshots, so a reviewer sees the result without building the game.
- **What to capture:** each state the change touches, taken from the built game (`npm run build`, then `npm run preview`, which serves it on port 4173): for example the Build phase, mid-wave, and the end of a game for the HUD, or enabled and disabled for a button. Use a 900 × 560 viewport (the 768 × 480 canvas plus the HUD above it, the build bar beside it and margins) so later PRs compare like for like.
- **How:** a throwaway Playwright script or spec, kept out of the commit, that opens the game with `openGame(page)` (`tests/e2e/helpers.ts`), sets up the state through the page and `window.__TD__` (`clickTile`, `loadScenario`, `step`), and calls `page.screenshot({ path })`. The config's 900 × 560 viewport applies. `npx playwright test <file>` builds and serves the game for you. Look at each image before attaching it.
- **Where they live:** the `pr-assets` branch, one folder per PR (`<pr-number>/<name>.png`). It is never merged, so images stay off `main`; GitHub has no API for uploading images to a PR. To add a folder:
  ```sh
  git fetch origin pr-assets
  git worktree add --detach .claude/worktrees/pr-assets-<pr-number> origin/pr-assets
  # copy the images into .claude/worktrees/pr-assets-<pr-number>/<pr-number>/
  git -C .claude/worktrees/pr-assets-<pr-number> add <pr-number>
  git -C .claude/worktrees/pr-assets-<pr-number> commit -m "docs: screenshots for #<pr-number>"
  git -C .claude/worktrees/pr-assets-<pr-number> push origin HEAD:pr-assets
  git worktree remove .claude/worktrees/pr-assets-<pr-number>
  ```
  If the push is rejected because another PR pushed first, run `git -C <that worktree> pull --rebase origin pr-assets` and push again.
- **PR body:** a **Screenshots** section embeds them as `![<what to look at>](https://github.com/itay28/Military-TD/blob/pr-assets/<pr-number>/<name>.png?raw=true)`, a table when there are several. The alt text says what the image shows ("Mid-wave: Start Wave disabled").
- **Session tracker:** embed the same images as `data:` URIs (an Artifact page can't load images from the private repo), with a one-line caption each.
- **A state you can't capture** (for example one only a test-mode scenario reaches): say so under the screenshots, and name the test that covers it.

### 5. PR
- Branch: `<type>/<issue>-<slug>`, e.g. `feat/8-tower-targeting`.
- PR title in Conventional Commit form (it becomes the squash commit and drives the version bump): `feat: tower targeting and firing`.
- Body via the `pr` skill, with `Closes #<n>` and the template checklist, plus screenshots for UI changes (step 4b).
- **Draft vs ready:** open the PR as a draft while work is still in progress. As soon as it's complete (acceptance criteria met, checks green, review done), mark it ready for review (`gh pr ready <n>`), make sure the issue's card is *In review* (the board-status hook usually does it), and say so on the issue. Never leave a finished PR in draft.
- **Review:** the *Claude Code Review* workflow is the one code review. Don't run `code-review` locally as well. It runs `mattpocock-skills:code-review` on Sonnet when a PR is opened as ready or marked ready, and posts a Standards / Spec report as a PR comment. Drafts are skipped, and pushes don't re-run it. Wait for the comment (`gh pr checks <n> --watch`, then `gh pr view <n> --comments`), then address its findings or say on the PR why not. To get a second review after substantial fixes, add the `review-again` label (`gh pr edit <n> --add-label review-again`); the run removes it.
- **Board:** the card moves to *In review* when the PR is marked ready, not when it is opened, and back to *In progress* if the PR is converted to a draft. In local sessions the board-status hook makes these moves after `gh pr ready`; check its report, and move the card by hand if it couldn't. Without the project token (e.g. `@claude` in CI), say on the issue which card needs moving (see `docs/agents/issue-tracker.md` → **Project board**). Merging the PR (or closing the issue) moves it to *Done* automatically.
- Squash-merge when CI is green. Never push to `main` directly.

## Token budget

Each tool call re-sends the whole conversation, so a long session costs more with every step. Keep sessions lean:
- **One issue per session.** Follow-ups on a finished PR (CI failures, review findings, merge conflicts) start a new session in the same worktree. The PR and the issue comments carry the context.
- **Read what you need.** Find the line with `Grep`, then read that range. Don't print whole files or long logs: pipe through `tail`, `grep`, or `--json` with `-q`.
- **Batch.** Put independent commands in one call, and don't re-read a file you just wrote.
- **Look at each screenshot once**, before attaching it.
- **Helper agents** start from scratch and re-read everything, so use them only when a skill requires one, and pass `model: "sonnet"` unless the task needs more.

## Definition of done
- [ ] Acceptance criteria met
- [ ] Issue has progress comments; description updated if the idea changed
- [ ] Session tracker shows the final status and the PR link
- [ ] UI changes: screenshots in the PR body and the session tracker (step 4b)
- [ ] Tests written first, now passing; new behaviour covered at the right layer
- [ ] `npm run check` green locally and in CI (plus e2e if UI changed)
- [ ] The CI review's findings are addressed, or the PR says why not
- [ ] No game rules outside `src/sim`; no Phaser in `src/sim`
- [ ] New assets recorded in `assets/manifest.json`
- [ ] Docs updated if behaviour, terms or decisions changed (PLAN, GLOSSARY, ADR)
- [ ] PR title is a Conventional Commit; body says `Closes #n` (the one exception: a milestone report PR says `Refs #<release issue>`; see `docs/agents/releasing.md` → **Milestone release**)

## Commit types and versions

| Type | Use for | Version effect before 1.0 | After 1.0 |
| --- | --- | --- | --- |
| `feat:` | New player-visible feature or content | patch | minor |
| `fix:` | Bug fix | patch | patch |
| `feat!:` / `BREAKING CHANGE:` | Breaks saves/settings or a big notable change | minor | major |
| `test:` `refactor:` `chore:` `ci:` `docs:` | Everything else | none | none |

A milestone ends with a release of the next minor version (`0.N.0`) through a `Release-As: 0.N.0` commit footer, carried by the milestone report PR; see `docs/agents/releasing.md` → **Milestone release** and ADR-0004.

PR titles are checked by the *PR title* workflow (`.github/workflows/pr-title.yml`, rule in `scripts/pr-title.ts`). PRs are squash-merged with the PR title as the commit subject and the PR body as the commit body, so the title is what release-please reads. (`pr-title` isn't a required status check, so a red title doesn't block the merge button; fix it before merging.)

Releases, deploys and milestone close-out: `docs/agents/releasing.md`.
