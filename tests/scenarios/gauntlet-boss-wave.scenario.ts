import { mapById } from '../../src/data/maps';
import type { Scenario } from '../../src/sim/scenario';
import { BALANCED_ORDER } from './bot-balanced.scenario';
import { buildOrder, fitOrder } from './bots';
import { defineScenario } from './define';

const gauntlet = mapById('gauntlet');

const setup: Omit<Scenario, 'until'> = {
  map: gauntlet.data,
  waves: gauntlet.waves,
  autoStartWaves: true,
  bot: buildOrder(fitOrder(gauntlet.data, BALANCED_ORDER)),
};

export default defineScenario({
  description:
    'Reference bot on Gauntlet, the boss map (#81): the last wave ends with both bosses, a Heavy tank and a Gunship. The bot destroys both in that wave. (The boss bar itself: `hairpin-boss-wave`.)',
  ...setup,
  until: 'end',
  expectations({ outcome, events }, expect) {
    expect(outcome).toBe('victory');
    const lastStart = events.find((e) => e.type === 'waveStarted' && e.waveNumber === gauntlet.waves.length)!;
    for (const kind of ['heavyTank', 'gunship'] as const) {
      const ends = events.filter(
        (e) => (e.type === 'enemyKilled' || e.type === 'enemyLeaked') && e.enemy.kind === kind,
      );
      expect(ends).toHaveLength(1);
      expect(ends[0]!.type).toBe('enemyKilled');
      expect(ends[0]!.tick).toBeGreaterThan(lastStart.tick);
    }
  },
});
