# Agent brief

What an unattended agent (the implement and PR steward routines) needs to work one issue or one PR. It replaces reading `docs/agents/workflow.md` and `docs/agents/issue-tracker.md` end to end: open those only at the section named below, when the task reaches it. `CLAUDE.md` is already loaded.

## Rules that shape the code
- **Rules live in `src/sim`**: no Phaser, no `Math.random`/`Date.now` there (ADR-0002). Tuning numbers go in `src/data`. Mechanics are realistic and readable, with no hard counters (ADR-0007).
- **Tests first** with the `tdd` skill (`.claude/skills/tdd`): failing test at the agreed seam, then the code, then refactor. Use the cheapest layer that proves the behaviour (ADR-0003): unit (Vitest), scenario (`tests/scenarios/*.scenario.ts`, `npm run scenario -- <name>`), or e2e (Playwright, `tests/e2e/`, open the game with `openGame(page)`). Details: `workflow.md` → **2. Tests first**.
- **Assets**: no third-party file without an `assets/manifest.json` entry and an allowed license (`docs/assets.md`).
- **Terms and decisions**: new domain terms go in `GLOSSARY.md`; anything hard to reverse is an ADR in `docs/adr/`. Read only the ADRs the issue touches.

## Steps
1. **Plan comment** on the issue: modules and interfaces, test seams, the test list, decisions. Within the acceptance criteria, it's the go-ahead; a scope change is a `needs-info` question instead.
2. **Progress comments**, one or two lines each: red, green, PR opened, ready. End each with a `Next:` line and push work in progress with it, so a retry continues from there instead of starting over. An hour without one counts as a dead session; a session gets one retry, then the issue is split.
3. **No session tracker.** It's for sessions a maintainer works in; here the issue comments are the log.
4. **Verify**: `npm run check`; `npm run test:e2e` only when the UI changed.
5. **Visual and audio changes**: before/after images of each touched state embedded in the PR body for anything that looks different (screens, sprites, art sheets, docs images; a file path isn't an image), and a playable link to each new or changed sound (`workflow.md` → **4b**). A later commit that changes them again updates the PR body and shows the new media in its comment (**4b** → **Follow-up changes**). Screenshot baselines failing on purpose: `workflow.md` → **Screenshot baselines** (in **2. Tests first**).
6. **PR**: branch `<type>/<issue>-<slug>`; Conventional Commit title; body from the `pr` skill with `Closes #<n>` and the template checklist. Draft first, ready once complete and green. Merge the base in to fix conflicts; never rebase, force-push or push to `main`. Never merge: the PR steward Action does.

## Cloud limits
- GitHub is REST only (GraphQL is blocked, so no `gh pr` / `gh issue`): use the built-in GitHub tools or `gh api repos/itay28/Military-TD/...`. Review-thread and ready routes: `workflow.md` → **Cloud sessions**.
- Never move board cards; *Board sync* does it.
- Questions the issue, `docs/PLAN.md`, the ADRs and `GLOSSARY.md` don't answer: ask on the issue, add `needs-info`, stop. Never guess.

## Keep it cheap
- `Grep` for the line, then read that range; don't print whole files or long logs (`tail`, `grep`, `--jq`).
- Batch independent commands in one call; don't re-read a file you just wrote.
- Look at each screenshot once.
- No helper agents unless a skill requires one.
