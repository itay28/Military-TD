/** What the tracker needs of a shell in flight (the sim's `Shell`). */
export interface ShellLike {
  readonly id: number;
  readonly landsAtMs: number;
}

export interface WhistleTracker {
  /**
   * The shells (of those still in flight) that are within the lead time of landing and haven't whistled yet; each is
   * returned once. Call it every frame with the sim's shells and clock.
   */
  due<S extends ShellLike>(shells: readonly S[], nowMs: number): S[];
  /** How many shells it remembers having whistled: only those still in flight. */
  tracked(): number;
}

/**
 * Times the mortar's incoming whistle (#404): `leadMs` before each shell lands. It reads the sim's shells and game
 * clock, so it keeps pace with the game speed and stops while paused.
 */
export function createWhistleTracker(leadMs: number): WhistleTracker {
  let whistled = new Set<number>();
  return {
    due(shells, nowMs) {
      const inFlight = new Set(shells.map((s) => s.id));
      whistled = new Set([...whistled].filter((id) => inFlight.has(id)));
      const due = shells.filter((s) => !whistled.has(s.id) && s.landsAtMs - nowMs <= leadMs);
      for (const s of due) whistled.add(s.id);
      return due;
    },
    tracked: () => whistled.size,
  };
}
