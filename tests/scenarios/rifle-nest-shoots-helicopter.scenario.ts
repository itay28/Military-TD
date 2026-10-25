import { defineScenario } from './define';

export default defineScenario({
  description: 'A Rifle Nest can hit air, so it damages a Helicopter flying past.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  waves: [{ kind: 'helicopter', count: 1, spacingMs: 0 }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots.length).toBeGreaterThan(0);
    // The Helicopter has no armor, so each hit removes the full 10.
    for (const shot of shots) expect(shot.hits).toEqual([{ enemyId: shot.targetId, damage: 10 }]);
  },
});
