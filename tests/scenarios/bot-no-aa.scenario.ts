import { WAVES } from '../../src/data/waves';
import { runScenario } from '../../src/sim/scenario';
import balanced, { BALANCED_ORDER } from './bot-balanced.scenario';
import { buildOrder, livesLostDuring, wavesWith } from './bots';
import { defineScenario } from './define';

/** `bot-balanced`'s order with each AA Gun a Rifle Nest instead. */
const NO_AA_ORDER = BALANCED_ORDER.map((step) =>
  'place' in step && step.place === 'aaGun' ? { ...step, place: 'rifleNest' as const } : step,
);

export default defineScenario({
  description:
    'Balance bot: bot-balanced without the AA Gun (Rifle Nests in its place). It loses more Lives to the Helicopter waves.',
  autoStartWaves: true,
  bot: buildOrder(NO_AA_ORDER),
  until: 'end',
  expectations(result, expect) {
    const helicopterWaves = wavesWith(WAVES, 'helicopter');
    const lost = livesLostDuring(result, helicopterWaves);
    const balancedLost = livesLostDuring(runScenario(balanced), helicopterWaves);
    expect(lost).toBeGreaterThanOrEqual(balancedLost + 4);
  },
});
