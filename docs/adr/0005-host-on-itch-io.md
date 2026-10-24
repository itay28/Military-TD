# 5. Host builds on itch.io

Date: 2026-10-24 · Status: Accepted

## Context

The repository is private. GitHub Pages for private repositories needs a paid plan, so Pages isn't free for us. GitHub Actions is free for private repos up to 2,000 minutes a month on the Free plan, which is plenty for CI on Linux runners. We want testers to play builds now, and the game to have a public home at 1.0.

## Decision

Deploy every release to an itch.io HTML5 project with butler from GitHub Actions. Until 1.0, the page is *Restricted* (or *Draft*), so only invited people can play. At 1.0 it becomes public, and the same page is the release.

## Consequences

- No hosting cost, and the code stays private.
- itch.io is a game storefront, with comments, devlogs and analytics, so the beta and the launch use the same place.
- Needs a one-time setup by a human: an itch.io account, the project page, and an API key stored as the `BUTLER_API_KEY` repo secret.
- Builds must use relative paths (Vite `base: "./"`) because itch.io serves games inside an iframe from its CDN.
- Keep CI on Linux runners. Windows and macOS minutes count 2× and 10× against the free quota.
