# 2. Keep the Simulation separate from rendering

Date: 2026-10-24 · Status: Accepted

## Context

Tower defense rules (pathing, targeting, waves, economy) are easy to get subtly wrong and tedious to check by playing. Phaser objects are hard to unit test.

## Decision

All game state and rules live in `src/sim`, a deterministic pure-TypeScript module with no Phaser imports. It advances only through `tick(dtMs)` with a fixed timestep, and changes only through explicit commands (`placeTower`, `startWave`) that return success or a failure reason. Phaser Scenes read `sim.state`, react to sim events, and forward input as commands.

## Consequences

- Rules are covered by fast Vitest tests that step the sim tick by tick. Agents can verify their work without a browser.
- Swapping shapes for sprites, or changing the renderer, never touches the rules.
- There's a little duplication: scenes keep display objects keyed by sim entity id and sync them every frame.
