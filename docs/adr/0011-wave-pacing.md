# 11. Wave pacing: overlapping wave timers, Tactical mode capped at 2 stars

Date: 2026-11-03 · Status: Accepted

## Context

Until now each wave started only when the player pressed Start Wave (or, with Auto-start on, 5 s after the last one was cleared). The enemy waited for the defender to be ready, which is neither realistic nor much pressure: a player could always build between waves in peace.

## Decision

1. **Timed by default.** Each wave has a **wave timer** (`WaveData.afterMs`, in `src/data/waves.ts`): its start time counted from the previous wave's start; the first wave's counts from the game's start (the build window). A wave without one uses `DEFAULT_WAVE_AFTER_MS` (40 s). No wave sets its own yet, on purpose: the balance bots win every map at the flat 40 s, and per-wave values (35–45 s by wave size) are tuning to add when playtests call for them. A wave arrives on time **whether or not the previous one is cleared**, so waves can overlap.
2. **Call in early.** `callNextWave` starts the next wave now, during a wave too, and the timer of the one after it restarts from that moment. There is **no bonus** for it: it only saves time.
3. **Several waves on the field.** Each active wave keeps its own spawn schedule, and each enemy belongs to its wave: a wave is cleared when its schedule is done and none of its enemies is left, and the Damage report keeps each wave's own damage, kills and time. **Victory** only when every wave has spawned and the field is clear.
4. **Tactical mode** (a setting, `Settings.tacticalMode`, off by default) has no timers: each wave starts only when the player calls it, on a clear field, as before. A win there earns **at most 2 stars** (`TACTICAL_MAX_STARS` in `src/sim/progression.ts`: Stars from Lives, then capped). The End screen and Level select say "Tactical: max 2 stars". The mode is fixed at game start (`GameConfig.tacticalMode`).
5. **Auto-start is removed** (`setAutoStart`, `AUTO_START_DELAY_MS`): the timers replace it.
6. **Hard** (#80) changes enemy stats and is separate; the two combine. Stars are kept per difficulty, and the cap applies in either.

## Consequences

- The sim stays deterministic (ADR-0002): timers count game time in ticks.
- Balance is checked in timed mode: the reference bot wins every map on the timers alone and in Tactical mode, a single tower kind struggles (ADR-0007), and `overlap-swamps-weak-build` shows a build that holds one wave being swamped by two.
- The HUD always shows the countdown to the next wave in timed mode, also during a wave, and the wave counter shows overlap ("Waves 4–5 / 20").
