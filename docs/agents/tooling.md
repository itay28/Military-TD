# Tooling notes

Pitfalls agents have hit in this repo, and the way around each one. Add to this file when you hit a new one.

## Environments

Sessions run locally (this PC), over Remote Control or `claude --bg` (also this PC), and in the cloud (claude.ai/code, `@claude` in GitHub Actions). They follow the same flow because anything with side effects runs in GitHub Actions, not in the client: board moves (*Board sync*), releases, the CI review. The `SessionStart` hook runs `npm run doctor` and tells the agent what this environment is missing (node version, `node_modules`, `gh` and its login).

| | Local / Remote Control | Cloud session | GitHub Actions |
| --- | --- | --- | --- |
| Repo settings, hooks, plugins in `.claude/settings.json` | yes | yes | `@claude` only |
| Workflow skills: plugin `workflow@itay28-skills` (private repo `itay28/claude-skills`) | yes (user scope, every repo) | yes through the repo settings, if the session can clone the private repo | no |
| `GH_TOKEN`: repo-scoped fine-grained PAT | `gh auth login` | the cloud environment's env vars | `github.token` |
| `PROJECT_TOKEN`: classic PAT, `project` + `repo` | user env var `GH_PROJECT_TOKEN`, or `~/.config/gh-project-token.txt` (only to set fields on new issues) | the cloud environment's env vars (same use) | repo secret `PROJECT_TOKEN` (Board sync, release board) |

Same names everywhere, each environment reading its own store; tokens never go in the repo. Prefer a separate token per environment, so one can be revoked without breaking the others.

**Local only:** `claude --bg` and the skills that use it (`/workflow:spawn-sessions`, `/workflow:stack-next`); the Windows notes below.

**Skills:** change them in `itay28/claude-skills`, push, then `/plugin marketplace update itay28-skills`. Don't copy skills into `~/.claude/skills`: cloud sessions can't see that folder.

**Git remote:** Military-TD pushes over HTTPS with Git Credential Manager. Windows' own `ssh` has no GitHub host key here, so `git@github.com:` remotes fail with "Host key verification failed".

## Windows and PowerShell

- **BOM breaks `Closes #n`.** Windows PowerShell 5.1 writes UTF-8 *with* a byte-order mark (`Set-Content -Encoding utf8`, `Out-File`, `>`). If a PR body file starts with a BOM, GitHub doesn't see the `Closes #n` on the first line and the issue isn't linked, with no error. Write body files with the editor's Write tool, Bash, or Node (all write no BOM), then pass `--body-file <path>`. To check a PR's link: `gh pr view <n> --json closingIssuesReferences`.
- **Quotes in `gh api graphql`.** PowerShell 5.1 mangles double quotes inside native-command arguments, so inline GraphQL queries break. Put the query in a file and pass `-F query=@<file>`, or call `gh` from a small Node script with `execFileSync` (arguments are passed as-is).
- **Multi-line text.** Don't build issue or PR bodies inline in PowerShell; use `--body-file` as above.
- **A stopped `vite preview` keeps its port.** Stopping the background task that ran `npx vite preview` kills `npx` but not the `node vite.js preview` child, so the next preview fails with "Port 4173 is already in use", and the old server keeps serving. Find the process with `Get-NetTCPConnection -LocalPort 4173 -State Listen`, check its command line (`Get-CimInstance Win32_Process -Filter "ProcessId=<id>"`), and stop it with `Stop-Process`.
- **Headless Chrome over DevTools: `--window-size` isn't the viewport.** With `--remote-debugging-port`, the headless window keeps room for browser chrome, so `--window-size=900,560` gives a viewport about 95 px shorter and screenshots cut off the bottom of the canvas. Set the viewport with `Emulation.setDeviceMetricsOverride` (`width: 900, height: 560, deviceScaleFactor: 1, mobile: false`) before navigating. The one-shot `--screenshot` command isn't affected.
- **Counting live objects with `Runtime.queryObjects` keeps them alive.** The array it returns holds every instance it found until its object group is released, so the next count includes objects that were already destroyed and looks like a leak. Pass an `objectGroup` to the calls and call `Runtime.releaseObjectGroup` after reading the count.

## Vitest

- **`import.meta.glob` goes stale in tests.** Vitest's module cache keeps a test file's transformed code, glob results included, until that file changes, so a file added later that matches the glob is silently skipped. List files at run time instead (`readdirSync` plus `await import()`), as `tests/scenarios/scenarios.test.ts` does. `npx vitest --clearCache` clears a stale cache.

## CI review

- **A PR that edits `claude-code-review.yml` gets no review.** `claude-code-action` checks that its workflow file matches the copy on `main` and skips the run otherwise ("Workflow validation failed"), while the check still shows as passed with no PR comment. Say so on the PR; the new config takes effect once it's merged.

## Git

- Each agent session works in its own worktree under `.claude/worktrees/` (git-ignored). Start new work from `origin/main`: `git fetch origin && git switch -c <type>/<issue>-<slug> origin/main`.
