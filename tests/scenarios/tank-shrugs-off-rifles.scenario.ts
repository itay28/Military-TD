import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

export default defineScenario({
  description: 'Two Rifle Nests at 2 damage a hit (armor 8) cannot stop one Tank; it leaks and costs 5 Lives.',
  towers: [
    { kind: 'rifleNest', tile: { col: 1, row: 0 } },
    { kind: 'rifleNest', tile: { col: 2, row: 0 } },
  ],
  waves: [{ groups: [{ kind: 'tank', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ finalState, events }, expect) {
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.hits).toEqual([{ enemyId: shot.targetId, damage: 2 }]);
    expect(events.some((e) => e.type === 'enemyKilled')).toBe(false);
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(1);
    expect(finalState.lives).toBe(START_LIVES - 5);
  },
});
