import { describe, expect, it } from 'vitest';
import { createMap, type Tile } from '../sim/map';
import { FIRST_MAP, SECOND_MAP } from '../../tests/e2e/firstMap';
import { MAPS, mapById, MVP_MAP } from './maps';
import { WAVES } from './waves';

function edgesOf({ col, row }: Tile, cols: number, rows: number): string[] {
  return [col === 0 && 'left', col === cols - 1 && 'right', row === 0 && 'top', row === rows - 1 && 'bottom'].filter(
    (edge): edge is string => edge !== false,
  );
}

describe('MVP map', () => {
  it('is a valid 16×10 map', () => {
    const map = createMap(MVP_MAP);
    expect([map.cols, map.rows]).toEqual([16, 10]);
  });

  it('enters on one edge and exits on another', () => {
    const { waypoints, cols, rows } = createMap(MVP_MAP);
    const entry = edgesOf(waypoints[0]!, cols, rows);
    const exit = edgesOf(waypoints[waypoints.length - 1]!, cols, rows);
    expect(entry).toHaveLength(1);
    expect(exit).toHaveLength(1);
    expect(exit).not.toEqual(entry);
  });
});

describe('map registry', () => {
  it('is never empty (GameScene defaults to the first map)', () => {
    expect(MAPS.length).toBeGreaterThan(0);
  });

  it('starts with the MVP map', () => {
    expect(MAPS[0]?.data).toBe(MVP_MAP);
  });

  it('starts with the map the e2e specs expect', () => {
    expect({ id: MAPS[0]?.id, name: MAPS[0]?.name }).toEqual(FIRST_MAP);
    expect({ id: MAPS[1]?.id, name: MAPS[1]?.name }).toEqual(SECOND_MAP);
  });

  it('has unique ids', () => {
    const ids = MAPS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MAPS)('$id: its id matches its map data, it has a name, and the map is valid', ({ id, name, data }) => {
    expect(data.id).toBe(id);
    expect(name.trim()).not.toBe('');
    expect(() => createMap(data)).not.toThrow();
  });

  it('lists Training Ground, then Switchback', () => {
    expect(MAPS.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'mvp', name: 'Training Ground' },
      { id: 'switchback', name: 'Switchback' },
    ]);
  });

  it('gives Training Ground the original `WAVES`', () => {
    expect(mapById('mvp').waves).toBe(WAVES);
  });

  it.each(MAPS)('$id: has a wave schedule, every wave with enemies', ({ waves }) => {
    expect(waves.length).toBeGreaterThan(0);
    for (const wave of waves) expect(wave.groups.reduce((sum, g) => sum + g.count, 0)).toBeGreaterThan(0);
  });

  it("Switchback's schedule is a step harder than Training Ground's and brings no new enemy kind", () => {
    const enemies = (waves: typeof WAVES) => waves.flatMap((w) => w.groups).reduce((sum, g) => sum + g.count, 0);
    const kinds = (waves: typeof WAVES) => new Set(waves.flatMap((w) => w.groups.map((g) => g.kind)));
    const { waves } = mapById('switchback');
    expect(waves.length).toBeGreaterThan(WAVES.length);
    expect(enemies(waves)).toBeGreaterThan(enemies(WAVES));
    expect([...kinds(waves)].every((kind) => kinds(WAVES).has(kind))).toBe(true);
    // Mixed groups come earlier: the first wave with two kinds is sooner than on Training Ground.
    const firstMixed = (ws: typeof WAVES) => ws.findIndex((w) => new Set(w.groups.map((g) => g.kind)).size > 1);
    expect(firstMixed(waves)).toBeLessThan(firstMixed(WAVES));
  });

  it('finds an entry by id', () => {
    expect(mapById('mvp').data).toBe(MVP_MAP);
  });

  it('throws for an unknown id, naming the ones there are', () => {
    expect(() => mapById('nope')).toThrow(/No map "nope".*mvp/);
  });
});
