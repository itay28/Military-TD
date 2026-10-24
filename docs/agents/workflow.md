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
- Assign yourself. Move it to *In progress* on the project board.
- `needs-triage` issues get planned first (step 1, via `/triage` or `/grill-with-docs`), then relabelled `ready-for-agent`. Don't implement them directly.

### 1. Plan (comment on the issue)
Post a short plan as an issue comment before writing code:
- **Modules and interfaces** touched or added, with signatures.
- **Seams to test**: the public interfaces the tests will go through, and what each one catches.
- **Test list**: the test names, written as behaviour ("tower ignores enemies out of range").
- **Decisions**: anything hard to reverse becomes an ADR in `docs/adr/`. New domain terms go in `GLOSSARY.md`.

The `tdd` skill asks for seams to be agreed before tests are written. For a `ready-for-agent` issue, this plan comment is that agreement: a plan inside the acceptance criteria can proceed. One that changes scope needs a human (comment and add `needs-info`).

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
- `npm run check` (typecheck, lint, unit, scenario tests) and `npm run test:e2e` when UI is touched.
- For gameplay changes, also run the relevant scenario with `npm run scenario -- <name>` and read the outcome.
- `code-review` before opening the PR.

### 5. PR
- Branch: `<type>/<issue>-<slug>`, e.g. `feat/8-tower-targeting`.
- PR title in Conventional Commit form (it becomes the squash commit and drives the version bump): `feat: tower targeting and firing`.
- Body via the `pr` skill, with `Closes #<n>` and the template checklist.
- Squash-merge when CI is green.

## Definition of done
- [ ] Acceptance criteria met
- [ ] Tests written first, now passing; new behaviour covered at the right layer
- [ ] `npm run check` green locally and in CI (plus e2e if UI changed)
- [ ] No game rules outside `src/sim`; no Phaser in `src/sim`
- [ ] New assets recorded in `assets/manifest.json`
- [ ] Docs updated if behaviour, terms or decisions changed (PLAN, GLOSSARY, ADR)
- [ ] PR title is a Conventional Commit; body says `Closes #n`

## Commit types and versions

| Type | Use for | Version effect before 1.0 | After 1.0 |
| --- | --- | --- | --- |
| `feat:` | New player-visible feature or content | patch | minor |
| `fix:` | Bug fix | patch | patch |
| `feat!:` / `BREAKING CHANGE:` | Breaks saves/settings or a big notable change | minor | major |
| `test:` `refactor:` `chore:` `ci:` `docs:` | Everything else | none | none |

A milestone ends with a release of the next minor version (`0.N.0`): add a `Release-As: 0.N.0` footer to the last commit, or edit the release-please PR. See ADR-0004.

## Releasing
release-please keeps an open "release PR" that collects changes since the last release and updates `CHANGELOG.md` and the version. Merging it tags `vX.Y.Z`, creates a GitHub Release, and the deploy workflow uploads that version to the restricted itch.io page (ADR-0005). (Set up by #27 and #17; update this section if the real setup differs.)
