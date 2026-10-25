import { defineScenario } from './define';

export default defineScenario({
  description: 'A Cannon beside the Path kills several Infantry of a tight group with one shell.',
  towers: [{ kind: 'cannon', tile: { col: 1, row: 3 } }],
  waves: [{ kind: 'infantry', count: 4, spacingMs: 0 }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, events }, expect) {
    expect(outcome).toBe('victory');
    // 30 damage kills 30 HP Infantry outright; the group is far tighter than the 1 tile splash.
    const first = events.find((e) => e.type === 'towerFired');
    expect(first?.hits.length).toBeGreaterThanOrEqual(2);
    expect(first?.hits.every((h) => h.damage === 30)).toBe(true);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(4);
    expect(events.filter((e) => e.type === 'towerFired').length).toBeLessThan(4);
  },
});
