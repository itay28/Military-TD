import { TOWER_STATS } from '../../src/data/towers';
import { tileCenter } from '../../src/sim/map';
import { defineScenario } from './define';

// The Mortar at (4, 4) stands beside the Path's first downward leg (x = 3.5): an Infantry walking down it
// passes 1 tile from the tile center, inside the 1.5-tile minimum range.
const MORTAR_TILE = { col: 4, row: 4 };
const center = tileCenter(MORTAR_TILE);
const { minRange } = TOWER_STATS.mortar;

export default defineScenario({
  description: 'A Mortar beside the Path holds fire while an Infantry passes its tile, and shells it before and after.',
  towers: [{ kind: 'mortar', tile: MORTAR_TILE }],
  waves: [{ kind: 'infantry', count: 1, spacingMs: 0 }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    const fired = events.filter((e) => e.type === 'shellFired');
    const gaps = fired.map(({ target }) => Math.hypot(target.x - center.x, target.y - center.y));
    // Never fires into the dead zone.
    for (const gap of gaps) expect(gap).toBeGreaterThan(minRange);
    // Shells it on the way in (above the tower) and on the way out (below it).
    expect(fired.some(({ target }) => target.y < center.y)).toBe(true);
    expect(fired.some(({ target }) => target.y > center.y)).toBe(true);
    // The Infantry walks through the dead zone: some stretch of time with it there and no shell fired.
    const firedTicks = fired.map((e) => e.tick);
    const longestPause = Math.max(...firedTicks.slice(1).map((tick, i) => tick - firedTicks[i]!));
    expect(longestPause).toBeGreaterThan(180); // more than the 3 s cooldown, in 1/60 s ticks
  },
});
