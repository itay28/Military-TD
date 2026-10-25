import { ENEMY_STATS } from '../../src/data/enemies';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { defineScenario } from './define';

export default defineScenario({
  description: 'A Rifle Nest beside the Path start kills one Infantry before it gets away.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    // 30 HP at 10 per shot: three hits, then the kill.
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots).toHaveLength(3);
    // Infantry has no armor, so each hit removes the full 10.
    for (const shot of shots) expect(shot.hits).toEqual([{ enemyId: shot.targetId, damage: 10 }]);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(1);
    expect(events.some((e) => e.type === 'enemyLeaked')).toBe(false);
    expect(finalState.lives).toBe(START_LIVES);
    expect(finalState.money).toBe(START_MONEY + ENEMY_STATS.infantry.reward);
  },
});
