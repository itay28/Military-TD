# Military-TD

A basic military-themed tower defense game.

## Agent skills

Use **Matt Pocock's skills** (`mattpocock-skills`) for all workflow steps. Don't use overlapping skills from other plugins (`agent-engineering:*`, Anthropic's `engineering:*`), and prefer `mattpocock-skills:code-review` over the built-in `/code-review`. `.claude/settings.json` turns those plugins off for this repo. Code review runs in CI only (`mattpocock-skills:code-review` on Sonnet, when a PR is marked ready), so don't also run it locally. Which skill to use when: `docs/agents/workflow.md`.

### Issue tracker

Issues are tracked in GitHub Issues on itay28/Military-TD (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Organization

Milestones are versions (`v0.1.0 — MVP` … `v1.0.0 — Release`). Every task is a sub-issue of one **epic** (parent issue labelled `epic`) and carries the matching `area:*` label (`core`, `towers`, `units`, `ui`, `art`, `infra`). New issues: pick the epic, area label, milestone, and add native "blocked by" dependencies. Game work carries a milestone; `area:infra` issues may have none and are worked on at any time.

The [project board](https://github.com/users/itay28/projects/4) tracks status. The *Board sync* Action moves Status from PRs and assignees (assign yourself, open the PR, mark it ready: the card follows); agents set Area, Priority and Size on new issues as `area:*`, `priority:*` and `size:*` labels, which *Board sync* copies to the board (a sizing agent sizes `ready-for-agent` issues nobody sized). How, and which token: `docs/agents/issue-tracker.md` → **Project board**.

### Tooling

Windows/PowerShell pitfalls (BOM breaks `Closes #n`, quotes in GraphQL): `docs/agents/tooling.md`.

## Plan

Roadmap, game flow, architecture and task order: `docs/PLAN.md`.

## Ground rules (always)

Full process in `docs/agents/workflow.md`. In short:

1. **Plan first**: post the plan (interfaces, seams, test list) on the issue before coding.
2. **Tests first**: write failing tests, then implement (red → green → refactor). Use the `tdd` skill.
3. **Agent-verifiable**: every behaviour is checked by unit tests, headless scenarios (`npm run scenario`), or Playwright e2e. Never rely on a human playing (ADR-0003).
4. **Rules live in `src/sim`**: no Phaser and no `Math.random`/`Date.now` there (ADR-0002). Mechanics are realistic and readable, with no hard counters (ADR-0007).
5. **Assets are tracked**: no third-party file gets committed without an entry in `assets/manifest.json` and an allowed license (`docs/assets.md`).
6. **Keep the issue current**: comment on the issue at each step (plan, red, green, PR, review). If the idea, flow or scope changes, update the issue description with a dated "Changed:" note.
7. **Session tracker**: publish an Artifact page from `docs/agents/session-tracker.html` (no design pass) with links to the issue and PR, what and why, the plan, a progress log, and status. Publish it at plan, PR ready, and done. Without the Artifact tool, use a pinned issue comment instead.
8. **Screenshots for UI changes**: a PR that changes what the player sees embeds screenshots of each touched state, in the PR body and the session tracker (`docs/agents/workflow.md` → **4b**).
9. **Draft until done, then ready**: PRs are drafts while in progress. Once a PR is complete and checks pass, mark it ready for review (`gh pr ready`). That starts the CI review: address its comment. The *Board sync* Action moves the card to *In review*; if its run failed, re-run it or move the card by hand (`docs/agents/issue-tracker.md` → **Project board**). Don't leave a finished PR in draft.
10. **Every PR closes an issue**: the PR title is a Conventional Commit (`feat:`, `fix:`, …; it drives versioning, ADR-0004) and the body says `Closes #n`. No issue yet? Create one first (epic, area label, milestone), then open the PR.
11. **Git**: work on a branch (`<type>/<issue>-<slug>`). Never push to `main` (it's protected), never force-push, never rewrite pushed history. PRs are squash-merged.
12. **Token budget**: one issue per session, read only what you need, batch commands (`docs/agents/workflow.md` → **Token budget**).
