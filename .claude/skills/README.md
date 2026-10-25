# Vendored skills

Cloud sessions (claude.ai/code, the auto-start and PR steward routines) never install plugins from `.claude/settings.json`, so the `mattpocock-skills` plugin isn't there. They do load skills from this folder, because it's part of the clone. So the skills the workflow needs (`docs/agents/workflow.md`) are copied here, unchanged, from the plugin's source (#170).

- **Source:** https://github.com/mattpocock/skills, commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2` (2026-10-19), `skills/engineering/<name>/`. The `agents/openai.yaml` files are left out (they're for another agent runtime).
- **License:** MIT, copied in `LICENSE-mattpocock-skills`. `pr/CREDITS.md` is upstream's own attribution for part of `pr`.
- **Locally**, the plugin is installed too. Its copies are `mattpocock-skills:<name>`, these are plain `<name>`; they're the same text at the commit above.

| Skill | Files | Used for |
| --- | --- | --- |
| `tdd` | `tdd/SKILL.md`, `tdd/tests.md`, `tdd/mocking.md` | Tests first, red → green → refactor (ground rule 2) |
| `pr` | `pr/SKILL.md`, `pr/CREDITS.md` | Writing the PR body |
| `diagnosing-bugs` | `diagnosing-bugs/SKILL.md`, `diagnosing-bugs/scripts/hitl-loop.template.sh` | Hard bugs and red CI the steward can't explain at a glance |

Not vendored: `code-review` runs only in CI with its own config; `implement` is replaced in the cloud by `docs/agents/prompts/implement.md`; planning skills (`triage`, `to-spec`, `to-tickets`, `grill-with-docs`, …) are run by the maintainer locally.

**Updating:** copy the folders again from a newer upstream commit, keep the files byte for byte, update the commit and the file list here (`tests/vendored-skills.test.ts` checks both), and say in the PR what changed upstream.
