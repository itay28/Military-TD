import { defineScenario } from './define';

export default defineScenario({
  description: 'A Rifle Nest can hit air, so it damages a Helicopter flying past, at 6 a hit through its armor 4.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  waves: [{ groups: [{ kind: 'helicopter', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots.length).toBeGreaterThan(0);
    // Armor 4 takes 4 off the Rifle Nest's 10. A killing hit removes only the HP that was left.
    const killed = events.some((e) => e.type === 'enemyKilled');
    const full = killed ? shots.slice(0, -1) : shots;
    for (const shot of full) expect(shot.hits).toEqual([{ enemyId: shot.targetId, damage: 6 }]);
  },
});
