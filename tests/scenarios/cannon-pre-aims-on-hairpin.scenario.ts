import { ENEMY_STATS } from '../../src/data/enemies';
import { mapById } from '../../src/data/maps';
import { TOWER_STATS } from '../../src/data/towers';
import { coverageIntervals } from '../../src/sim/coverage';
import { createPathLine } from '../../src/sim/enemies';
import { createMap, tileCenter } from '../../src/sim/map';
import { defineScenario } from './define';

// On Hairpin the Path runs east along row 3, down the far side, then back west along row 6. A Cannon on (8, 5)
// covers both legs but not the bend: the Tank leaves its range and comes back into it later, heading the other
// way. Laid on the re-entry point while it's out of range, the slow turret fires as it comes back in, instead of
// turning for over half a second first.
const hairpin = mapById('hairpin').data;
const CANNON_TILE = { col: 8, row: 5 };
const line = createPathLine(createMap(hairpin).waypointPositions);
const [, back] = coverageIntervals(line, tileCenter(CANNON_TILE), TOWER_STATS.cannon.range);
const TICKS_PER_S = 60;

export default defineScenario({
  description:
    'On Hairpin, a Cannon lays its gun on the far leg while the Tank is out of range, and fires as it re-enters.',
  map: hairpin,
  money: 1000,
  towers: [{ kind: 'cannon', tile: CANNON_TILE }],
  waves: [{ groups: [{ kind: 'tank', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'callNextWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    if (!back) throw new Error('the Cannon should cover the way back');
    const reentryTick = (back.enter / ENEMY_STATS.tank.speed) * TICKS_PER_S;
    const shotsBack = events.filter((e) => e.type === 'towerFired' && e.position.y > 6);
    expect(shotsBack.length).toBeGreaterThan(0);
    // Within two ticks of coming back into range, not after a turn.
    expect(shotsBack[0]!.tick).toBeLessThanOrEqual(reentryTick + 2);
  },
});
