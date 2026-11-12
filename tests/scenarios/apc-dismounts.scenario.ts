import { ENEMY_STATS } from '../../src/data/enemies';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { damageReport } from '../../src/sim/report';
import { defineScenario } from './define';

// The APC joins the later waves of maps 2–4 (#366); here, one alone shows its squad jumping out.
export default defineScenario({
  description:
    'Two Rifle Nests and a Mortar kill one APC near the Path start; its 3 Infantry jump out and every one is either killed or leaks.',
  towers: [
    { kind: 'rifleNest', tile: { col: 1, row: 3 } },
    { kind: 'rifleNest', tile: { col: 2, row: 3 } },
    { kind: 'mortar', tile: { col: 4, row: 4 } },
  ],
  waves: [{ groups: [{ kind: 'apc', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'callNextWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    const dismounted = events.filter((e) => e.type === 'dismounted');
    expect(dismounted).toHaveLength(1);
    const squad = dismounted[0]!.spawned;
    expect(squad.map((e) => e.kind)).toEqual(['infantry', 'infantry', 'infantry']);

    const killed = events.filter((e) => e.type === 'enemyKilled').map((e) => e.enemy);
    const leaked = events.filter((e) => e.type === 'enemyLeaked').map((e) => e.enemy);
    expect(killed[0]!.kind).toBe('apc');
    // The squad all ends up killed or leaked: the wave clears only once they are gone.
    expect([...killed, ...leaked].map((e) => e.id).sort()).toEqual(
      [dismounted[0]!.enemy.id, ...squad.map((e) => e.id)].sort(),
    );
    const rewards = killed.reduce((sum, e) => sum + ENEMY_STATS[e.kind].reward, 0);
    expect(finalState.money).toBe(START_MONEY + rewards);
    expect(finalState.lives).toBe(START_LIVES - leaked.length * ENEMY_STATS.infantry.leakCost);
    expect(damageReport(finalState.stats).total.kills).toBe(killed.length);
  },
});
