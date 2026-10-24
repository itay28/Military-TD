---
name: promote-ready
description: Move unblocked Backlog issues of a milestone (default the current one) to Ready on the project board. Use when the user says "promote ready issues", "refresh the Ready column", "what's unblocked", or after closing issues that blocked others.
argument-hint: "[milestone] [--dry-run]"
---

# Promote ready issues

Moves issues from **Backlog** to **Ready** on the [project board](https://github.com/users/itay28/projects/4) for one milestone.

An issue moves when it is all of (the Ready rule in `docs/agents/issue-tracker.md`):

- open, on the board in **Backlog**, in the milestone;
- labelled `ready-for-agent`;
- no open "blocked by" dependencies;
- unassigned.

Everything else stays put. The script lists each held issue with the reason.

## Run

```sh
node .claude/skills/promote-ready/promote-ready.mjs [--milestone <m>] [--dry-run]
```

- `--milestone`: number (`2`), exact title, or title prefix (`v0.2`). Omit it for the **current milestone**: the open milestone with the earliest due date, or, with no due dates, the lowest version in its title.
- `--dry-run`: report without changing the board.

Map the user's argument: a bare milestone (`v0.2`, `2`) → `--milestone`; "dry run", "preview", "what would move" → `--dry-run`.

Board edits need the classic token (`project` + `repo` scopes). The script reads `GH_PROJECT_TOKEN`, else the file in `GH_PROJECT_TOKEN_FILE`, else `~/.config/gh-project-token.txt[.txt]`. If none is found, ask the human for it. Never print it.

## Report

Relay the script's output: the milestone, the issues moved (number and title), and the issues held back with their reasons. Issues held only by a missing `ready-for-agent` label usually need `/triage` first; say so.

Next step: `/spawn-sessions` opens a session for each Ready issue.
