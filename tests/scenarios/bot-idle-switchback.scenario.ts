import { mapById } from '../../src/data/maps';
import { defineScenario } from './define';

const switchback = mapById('switchback');

export default defineScenario({
  description:
    'Balance bot on Switchback: builds nothing and starts each wave at once. Its own waves end it in Defeat.',
  map: switchback.data,
  waves: switchback.waves,
  autoStartWaves: true,
  until: 'end',
  expectations({ outcome, finalState }, expect) {
    expect(outcome).toBe('defeat');
    expect(finalState.map.id).toBe('switchback');
    expect(finalState.totalWaves).toBe(switchback.waves.length);
  },
});
