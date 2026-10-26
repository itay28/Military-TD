import { ENEMY_STATS } from '../../src/data/enemies';
import { defineScenario } from './define';

// one-tower-kills-one-infantry with the nest upgraded twice before the wave.
export default defineScenario({
  description: 'A level-3 Rifle Nest (heavier weapon: 16 damage) kills one Infantry in 2 shots, not 3.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  money: 110,
  waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [
    { atTick: 0, command: { type: 'upgradeTower', towerId: 1 } },
    { atTick: 0, command: { type: 'upgradeTower', towerId: 1 } },
    { atTick: 0, command: { type: 'startWave' } },
  ],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    const upgrades = events.flatMap((e) =>
      e.type === 'command' && e.command.type === 'upgradeTower' ? [e.result] : [],
    );
    expect(upgrades).toEqual([
      { ok: true, level: 2 },
      { ok: true, level: 3 },
    ]);
    // 30 HP: a 16-damage hit, then the last 14.
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots.map((shot) => shot.hits[0]?.damage)).toEqual([16, 14]);
    expect(finalState.towers[0]).toMatchObject({ level: 3, spent: 160 });
    expect(finalState.money).toBe(110 - 40 - 70 + ENEMY_STATS.infantry.reward);
  },
});
