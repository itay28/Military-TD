import { defineScenario } from './define';

export default defineScenario({
  description:
    'The same 3-Helicopter wave as aa-gun-vs-helicopters, with a lone Rifle Nest instead: it kills 1 and leaks 2.',
  towers: [{ kind: 'rifleNest', tile: { col: 4, row: 4 } }],
  waves: [{ groups: [{ kind: 'helicopter', count: 3, spacingMs: 1500, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ events }, expect) {
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(2);
  },
});
