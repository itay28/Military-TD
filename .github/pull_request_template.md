<!-- PR title must be a Conventional Commit, e.g. "feat: tower targeting and firing" -->

Closes #

## What changed

## How it was tested
<!-- Which unit / scenario / e2e tests cover this; anything run manually -->

## Checklist
- [ ] Plan was posted on the issue before coding; progress comments kept it current
- [ ] Session tracker link (maintainer sessions only): <!-- artifact URL or pinned comment; routines: n/a -->
- [ ] Tests were written first and are now passing
- [ ] `npm run check` passes (and `npm run test:e2e` if UI changed)
- [ ] Anything looks different (screens, sprites, art, docs images): a **Screenshots** section embedding before/after images of each touched state, not file paths (`docs/agents/workflow.md` → **4b**)
- [ ] A sound was added or changed: an **Audio** section linking a before/after copy of each that plays in the browser, not downloads (**4b** → **Sounds**)
- [ ] Later commits changed the look or sound again: the sections above show the latest version, and the comment reporting it shows it too
- [ ] Game rules stay in `src/sim` (no Phaser there)
- [ ] Docs updated if needed (PLAN, GLOSSARY, ADR)
