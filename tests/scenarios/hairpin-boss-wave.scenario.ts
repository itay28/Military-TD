import { mapById } from '../../src/data/maps';
import { leadBoss } from '../../src/sim/enemies';
import { runScenario, type Scenario } from '../../src/sim/scenario';
import { BALANCED_ORDER } from './bot-balanced.scenario';
import { buildOrder, fitOrder } from './bots';
import { defineScenario } from './define';

const hairpin = mapById('hairpin');

const setup: Omit<Scenario, 'until'> = {
  map: hairpin.data,
  waves: hairpin.waves,
  autoStartWaves: true,
  bot: buildOrder(fitOrder(hairpin.data, BALANCED_ORDER)),
};

export default defineScenario({
  description:
    "Reference bot on Hairpin: one Heavy tank ends the last wave (#366). While it is on the field, it is the boss the HUD's boss bar shows.",
  ...setup,
  until: 'end',
  expectations({ outcome, events }, expect) {
    expect(outcome).toBe('victory');
    const lastStart = events.find((e) => e.type === 'waveStarted' && e.waveNumber === hairpin.waves.length)!;
    const bossEnd = events.find(
      (e) => (e.type === 'enemyKilled' || e.type === 'enemyLeaked') && e.enemy.kind === 'heavyTank',
    )!;
    expect(bossEnd.tick).toBeGreaterThan(lastStart.tick);
    // A tick before it went, the Heavy tank is the lead boss: the one the boss bar shows.
    const before = runScenario({ ...setup, until: { ticks: bossEnd.tick - 1 } });
    expect(before.finalState.waveNumber).toBe(hairpin.waves.length);
    expect(leadBoss(before.finalState.enemies)?.kind).toBe('heavyTank');
  },
});
