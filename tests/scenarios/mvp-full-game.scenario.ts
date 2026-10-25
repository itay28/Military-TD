import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

export default defineScenario({
  description:
    'The MVP game played start to end: two Rifle Nests bought with the starting Money, waves started as soon as allowed.',
  script: [
    { atTick: 0, command: { type: 'placeTower', kind: 'rifleNest', tile: { col: 2, row: 3 } } },
    { atTick: 0, command: { type: 'placeTower', kind: 'rifleNest', tile: { col: 7, row: 6 } } },
  ],
  autoStartWaves: true,
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(events.filter((e) => e.type === 'command' && e.result.ok)).toHaveLength(3);
    // Two nests hold the MVP wave: every Infantry dies, none leaks.
    expect(outcome).toBe('victory');
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(8);
    expect(finalState.lives).toBe(START_LIVES);
    // Per-tower damage and kills add up to the overall figures.
    const { total, towers } = finalState.stats;
    const sum = (key: 'damage' | 'kills') => Object.values(towers).reduce((acc, t) => acc + t.total[key], 0);
    expect(total.damage).toBeGreaterThan(0);
    expect(sum('damage')).toBe(total.damage);
    expect(sum('kills')).toBe(total.kills);
    expect(total.kills).toBe(8);
  },
});
