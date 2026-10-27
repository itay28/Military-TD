import { defineScenario } from './define';

export default defineScenario({
  description:
    'The same 2-Helicopter wave as aa-gun-vs-helicopters, with a lone Rifle Nest instead: it damages both, and both leak.',
  towers: [{ kind: 'rifleNest', tile: { col: 4, row: 4 } }],
  waves: [{ groups: [{ kind: 'helicopter', count: 2, spacingMs: 6000, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    expect(events.filter((e) => e.type === 'towerFired').length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(2);
  },
});
