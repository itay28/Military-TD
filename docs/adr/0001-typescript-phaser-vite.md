# 1. TypeScript + Phaser 4 + Vite for a browser game

Date: 2026-10-24 · Status: Accepted

## Context

The game is a small 2D tower defense side project. It should be easy to share, and AI agents (local Claude sessions and `@claude` on GitHub) should be able to do most of the implementation. That favors a codebase that is all text and can be tested headlessly, over an engine whose scenes are edited in a GUI editor.

## Decision

Build for the web with TypeScript (strict), Phaser 4 for rendering, input and scenes, Vite for dev and build, and Vitest for tests. Hosting is decided in ADR-0005 (itch.io).

## Consequences

- Anyone can play it from a link, with nothing to install.
- Agents can work on the whole codebase. Only feel and balance need human playtesting.
- Godot and Unity were rejected because their editor-centric workflow is overkill here and weakens agent autonomy.
- Phaser 4 is fairly new (latest 4.2.x), so some tutorials and examples online target Phaser 3 APIs. Check them against the v4 docs.
