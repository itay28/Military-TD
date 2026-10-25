import { defineScenario } from './define';

export default defineScenario({
  description: 'An AA Gun beside the Path stops a small Helicopter wave that would leak past a lone Rifle Nest.',
  towers: [{ kind: 'aaGun', tile: { col: 4, row: 4 } }],
  waves: [{ kind: 'helicopter', count: 3, spacingMs: 1500 }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, events }, expect) {
    expect(outcome).toBe('victory');
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(3);
  },
});
