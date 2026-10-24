---
name: spawn-sessions
description: Open one Claude Code session per Ready issue in a milestone (default the current one), each in its own git worktree and Windows Terminal tab, prompted to pick up its issue. Use when the user says "spawn sessions", "start agents on the ready issues", or "one session per ticket".
argument-hint: "[milestone] [--issues 8,10] [--limit N] [--dry-run]"
disable-model-invocation: true
---

# Spawn sessions

Opens a separate interactive Claude Code session for each **Ready** issue of a milestone on the [project board](https://github.com/users/itay28/projects/4). Each session gets its own context, worktree and terminal tab, so the human talks to each ticket's agent separately.

For each Ready, open, unassigned issue, the script:

1. creates a worktree at `<main checkout>/.claude/worktrees/issue-<n>`, detached at `origin/main`. The session makes its own `<type>/<issue>-<slug>` branch (`docs/agents/workflow.md`);
2. opens a tab titled `#<n> <title>` in the Windows Terminal window `Military-TD`, running `claude "Pick up issue #<n>."`.

It skips issues that are assigned or already have an `issue-<n>` worktree, so running it twice doesn't double up. Each session claims its issue (assigns itself, moves it to *In progress*) following the workflow.

## Run

First do a dry run and show the human the list:

```sh
node .claude/skills/spawn-sessions/spawn-sessions.mjs [--milestone <m>] [--issues 8,10] [--limit N] [--prompt "..."] --dry-run
```

Then run the same command without `--dry-run`, unless the human asked for a preview only. If the human already named exactly which issues to spawn, skip the confirmation.

- `--milestone`: number, exact title, or title prefix (`v0.2`). Omit it for the current milestone (same rule as `/promote-ready`).
- `--issues`: only these issue numbers.
- `--limit`: open at most N sessions. Each session uses its own tokens, so suggest a limit when there are many.
- `--prompt`: prompt template; `{n}` is the issue number, `{title}` its title. Default `Pick up issue #{n}.`

Needs Windows Terminal (`wt`) and `claude` on PATH, plus the classic project token (as in `/promote-ready`) to read the board.

No Ready issues? Run `/promote-ready` first.

## Report

List the sessions opened (issue, worktree path) and the issues skipped with reasons. Remind the human that cleanup after merge is `git worktree remove .claude/worktrees/issue-<n>`.
