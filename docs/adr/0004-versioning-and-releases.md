# 4. Versioning: SemVer, 0.x until release, automated with release-please

Date: 2026-10-24 · Status: Accepted · Updated 2026-10-24: milestone releases go through a milestone report PR (#95) · Updated 2026-10-26: the PR steward ships milestone releases; patch releases are manual (#187)

## Context

We want `major.minor.patch` versions, but releasing a game as "5.0.0" just because big features landed feels wrong. Meanwhile, the roadmap is a short list of notable steps (MVP, expand, art, menus).

## Decision

Follow [Semantic Versioning](https://semver.org) with its 0.x rules before the first public release:

- **Before 1.0 (development):** `0.MINOR.PATCH`.
  - **Minor** = a roadmap milestone, one of the notable steps (v0.1.0 MVP, v0.2.0 Combat depth, v0.3.0 Game shell, … v0.9.0 Beta; see PLAN.md).
  - **Patch** = any feature or fix that lands during a milestone (`feat:` and `fix:` both bump the patch).
- **1.0.0** = first public release.
- **After 1.0:** standard SemVer. **Major** = a notable change worth announcing (big content update, save/settings incompatibility). **Minor** = new feature or content. **Patch** = bug fix or hotfix.

Mechanics:
- Conventional Commit PR titles, squash-merged, with a CI check on titles.
- **release-please** keeps an open release PR with the next version and a generated `CHANGELOG.md`. Config: `bump-minor-pre-major: true`, `bump-patch-for-minor-pre-major: true`. Milestone releases are forced with a `Release-As: 0.N.0` commit footer.
- A milestone release goes through a **milestone report PR** (`chore: release 0.N.0`). It is opened when the milestone's last issue other than its release issue closes, adds an audit of what the milestone delivered (`docs/releases/0.N.0.md`), and carries the `Release-As: 0.N.0` footer. Once the milestone is done, the PR steward merges it and then the release PR, which ships `v0.N.0` (#187); a human can hold the report PR with `hold` to review it first. The steward never merges a release PR for any other version: a patch release ships only when a human merges the release PR. Each milestone has a **release issue** that tracks it on the project board and closes on the release. The flow is in `docs/agents/releasing.md` → **Milestone release**.
- Merging the release PR tags `vX.Y.Z` and publishes a GitHub Release. That triggers the itch.io deploy (ADR-0005).
- The build embeds the version, and the game shows it in a corner. Bug reports should include it.

## Consequences

- Version numbers stay meaningful: 0.3.x always means "has art, no menus yet".
- Releasing is a deliberate act, not a side effect of every merge: a milestone ships when it's done, and a patch release when a human merges the release PR.
- Each milestone release leaves a written record of what was planned and what shipped.
- Once the report PR is automated (#96), nobody has to remember the `Release-As` footer.
- The one-time GitHub setting "Allow GitHub Actions to create and approve pull requests" must be enabled by a maintainer.
