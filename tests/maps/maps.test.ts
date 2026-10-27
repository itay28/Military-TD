import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../../src/data/maps';
import { runScenario } from '../../src/sim/scenario';
import { importTiledMap } from '../../src/sim/tiled';
import { BALANCED_ORDER } from '../scenarios/bot-balanced.scenario';
import { buildOrder, fitOrder } from '../scenarios/bots';

// Every map in `maps/` must import cleanly and be winnable by the reference bot (ADR-0006).

const MAPS_DIR = 'maps';
const FIXTURE = 'tests/maps/fixtures/mvp.tmj';

const load = (file: string) => importTiledMap(basename(file, '.tmj'), JSON.parse(readFileSync(file, 'utf8')));

const mapFiles = readdirSync(MAPS_DIR)
  .filter((name) => name.endsWith('.tmj'))
  .map((name) => join(MAPS_DIR, name));

describe('Tiled map files', () => {
  it('the MVP fixture converts to the MVP map', () => {
    const map = load(FIXTURE);
    expect(map.waypoints).toEqual(MVP_MAP.waypoints);
    expect([map.cols, map.rows]).toEqual([MVP_MAP.cols, MVP_MAP.rows]);
  });

  it.each([FIXTURE, ...mapFiles])('%s imports and the reference bot wins it', (file) => {
    const map = load(file);
    const result = runScenario({
      map,
      autoStartWaves: true,
      bot: buildOrder(fitOrder(map, BALANCED_ORDER)),
      until: 'end',
    });
    expect(result.outcome).toBe('victory');
  });
});
