# Military-TD

A basic military-themed tower defense game.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on itay28/Military-TD (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Organization

Milestones are versions (`v0.1.0 — MVP` … `v1.0.0 — Release`). Every task is a sub-issue of one **epic** (parent issue labelled `epic`) and carries the matching `area:*` label (`core`, `towers`, `units`, `ui`, `art`, `infra`). New issues: pick the epic, area label, milestone, and add native "blocked by" dependencies.

## Plan

Roadmap, game flow, architecture and task order: `docs/PLAN.md`.

## Ground rules (always)

Full process in `docs/agents/workflow.md`. In short:

1. **Plan first**: post the plan (interfaces, seams, test list) on the issue before coding.
2. **Tests first**: write failing tests, then implement (red → green → refactor). Use the `tdd` skill.
3. **Agent-verifiable**: every behaviour is checked by unit tests, headless scenarios (`npm run scenario`), or Playwright e2e. Never rely on a human playing (ADR-0003).
4. **Rules live in `src/sim`**: no Phaser and no `Math.random`/`Date.now` there (ADR-0002).
5. **PR title is a Conventional Commit** (`feat:`, `fix:`, …) and the body says `Closes #n`. It drives versioning (ADR-0004).
