import { describe, expect, it } from 'vitest';
import { MAPS, SERPENTINE_MAP } from '../data/maps';
import { TICK_MS } from './game';
import { HEAVY_LOAD } from '../data/heavyLoad';
import { createHeavyLoadGame, heavyLoadSetup } from './heavyLoad';
import { createMap, tileKey } from './map';

describe('heavyLoadSetup', () => {
  const setup = heavyLoadSetup();

  it('plays on the map with the longest Path (every map is the same size)', () => {
    const pathLength = (data: (typeof MAPS)[number]['data']) => createMap(data).pathTiles.length;
    const longest = Math.max(...MAPS.map((entry) => pathLength(entry.data)));
    expect(setup.map).toBe(SERPENTINE_MAP);
    expect(pathLength(SERPENTINE_MAP)).toBe(longest);
  });

  it(`places ${HEAVY_LOAD.towers} towers of every kind on distinct buildable tiles`, () => {
    const towers = setup.towers ?? [];
    expect(towers).toHaveLength(HEAVY_LOAD.towers);
    const map = createMap(SERPENTINE_MAP);
    for (const { tile } of towers) expect(map.isBuildable(tile)).toBe(true);
    expect(new Set(towers.map(({ tile }) => tileKey(tile))).size).toBe(towers.length);
    expect(new Set(towers.map(({ kind }) => kind))).toEqual(new Set(['rifleNest', 'aaGun', 'cannon', 'mortar']));
  });

  it(`sends one wave of ${HEAVY_LOAD.enemies} enemies of every kind`, () => {
    const waves = setup.waves ?? [];
    expect(waves).toHaveLength(1);
    const groups = waves[0]!.groups;
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(HEAVY_LOAD.enemies);
    expect(new Set(groups.map(({ kind }) => kind))).toEqual(new Set(['infantry', 'jeep', 'tank', 'helicopter']));
  });

  it('is the same for the same seed and differs for another', () => {
    expect(heavyLoadSetup()).toEqual(setup);
    expect(heavyLoadSetup(HEAVY_LOAD.seed + 1).towers).not.toEqual(setup.towers);
  });
});

describe('createHeavyLoadGame', () => {
  it('is mid-wave with every enemy spawned and nearly all of them still on the Path', () => {
    const game = createHeavyLoadGame();
    const { phase, enemies, towers } = game.state;
    expect(phase).toBe('wave');
    expect(towers).toHaveLength(HEAVY_LOAD.towers);
    expect(enemies.length).toBeGreaterThanOrEqual(190);
  });

  it(`stays heavy for the ${HEAVY_LOAD.measureTicks} measured ticks: no Defeat, and plenty of enemies left`, () => {
    const game = createHeavyLoadGame();
    for (let i = 0; i < HEAVY_LOAD.measureTicks; i++) game.tick(TICK_MS);
    expect(game.state.phase).toBe('wave');
    expect(game.state.enemies.length).toBeGreaterThanOrEqual(100);
  });
});
