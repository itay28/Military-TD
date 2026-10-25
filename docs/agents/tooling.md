# Tooling notes

Pitfalls agents have hit in this repo, and the way around each one. Add to this file when you hit a new one.

## Windows and PowerShell

- **BOM breaks `Closes #n`.** Windows PowerShell 5.1 writes UTF-8 *with* a byte-order mark (`Set-Content -Encoding utf8`, `Out-File`, `>`). If a PR body file starts with a BOM, GitHub doesn't see the `Closes #n` on the first line and the issue isn't linked, with no error. Write body files with the editor's Write tool, Bash, or Node (all write no BOM), then pass `--body-file <path>`. To check a PR's link: `gh pr view <n> --json closingIssuesReferences`.
- **Quotes in `gh api graphql`.** PowerShell 5.1 mangles double quotes inside native-command arguments, so inline GraphQL queries break. Put the query in a file and pass `-F query=@<file>`, or call `gh` from a small Node script with `execFileSync` (arguments are passed as-is).
- **Multi-line text.** Don't build issue or PR bodies inline in PowerShell; use `--body-file` as above.
- **A stopped `vite preview` keeps its port.** Stopping the background task that ran `npx vite preview` kills `npx` but not the `node vite.js preview` child, so the next preview fails with "Port 4173 is already in use", and the old server keeps serving. Find the process with `Get-NetTCPConnection -LocalPort 4173 -State Listen`, check its command line (`Get-CimInstance Win32_Process -Filter "ProcessId=<id>"`), and stop it with `Stop-Process`.

## Vitest

- **`import.meta.glob` goes stale in tests.** Vitest's module cache keeps a test file's transformed code, glob results included, until that file changes, so a file added later that matches the glob is silently skipped. List files at run time instead (`readdirSync` plus `await import()`), as `tests/scenarios/scenarios.test.ts` does. `npx vitest --clearCache` clears a stale cache.

## Git

- Each agent session works in its own worktree under `.claude/worktrees/` (git-ignored). Start new work from `origin/main`: `git fetch origin && git switch -c <type>/<issue>-<slug> origin/main`.
