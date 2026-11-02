import { describe, expect, it } from 'vitest';
import { isFaction } from '../sim/factions';
import { createMap, type Tile } from '../sim/map';
import { FIRST_MAP } from '../../tests/e2e/firstMap';
import { groundImagePath, groundTextureKey, MAPS, mapById, MVP_MAP } from './maps';

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

  it.each(MAPS)('$id: names its Attacker and Defender Factions, as its map file says (ADR-0009)', (entry) => {
    expect(isFaction(entry.attacker)).toBe(true);
    expect(isFaction(entry.defender)).toBe(true);
    expect({ attacker: entry.attacker, defender: entry.defender }).toEqual({
      attacker: entry.data.attacker,
      defender: entry.data.defender,
    });
  });

  it('finds an entry by id', () => {
    expect(mapById('mvp').data).toBe(MVP_MAP);
  });

  it('throws for an unknown id, naming the ones there are', () => {
    expect(() => mapById('nope')).toThrow(/No map "nope".*mvp/);
  });
});

describe('ground images (#312)', () => {
  it('gives every map with a ground-image layer its image URL', () => {
    for (const entry of MAPS) {
      if (entry.data.groundImage === undefined) expect(entry.groundImageUrl).toBeUndefined();
      else expect(entry.groundImageUrl).toMatch(/naip-maps\/.+\.jpg/);
    }
    expect(mapById('mvp').groundImageUrl).toBeDefined();
  });

  it('loads each ground image under a key named after its map', () => {
    expect(groundTextureKey('mvp')).toBe('ground:mvp');
  });

  it("resolves a map's image path from the maps folder to this module's", () => {
    expect(groundImagePath('../assets/naip-maps/a.jpg')).toBe('../../assets/naip-maps/a.jpg');
    expect(groundImagePath('../assets/x/../naip-maps/b.jpg')).toBe('../../assets/naip-maps/b.jpg');
    expect(groundImagePath('c.jpg')).toBe('../../maps/c.jpg');
  });
});
