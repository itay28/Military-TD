import { describe, expect, it } from 'vitest';
import { LAYER_NAME, TOWER_NAMES, TOWER_ROLES } from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { placeTip, TIP_GAP, towerTooltip } from './towerTooltip';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];

describe('towerTooltip', () => {
  it.each(KINDS)('%s: name, role line and stats, all from src/data', (kind) => {
    const stats: (typeof TOWER_STATS)[TowerKind] = TOWER_STATS[kind];
    const tip = towerTooltip(kind);
    expect(tip.name).toBe(TOWER_NAMES[kind]);
    expect(tip.role).toBe(TOWER_ROLES[kind]);
    const value = (label: string) => tip.rows.find((row) => row.label === label)?.value;
    expect(tip.rows.map((row) => row.label)).toEqual(['Cost', 'Damage', 'Range', 'Fire rate', 'Hits']);
    expect(value('Cost')).toBe(String(stats.cost));
    expect(value('Damage')).toBe(String(stats.damage));
    expect(value('Range')).toContain(String(stats.range));
    expect(value('Fire rate')).toBe(`${Number(stats.fireRate.toFixed(2))}/s`);
    for (const layer of stats.targets) expect(value('Hits')).toContain(LAYER_NAME[layer]);
  });

  it('spells out the Rifle Nest', () => {
    expect(towerTooltip('rifleNest')).toEqual({
      name: 'Rifle Nest',
      role: TOWER_ROLES.rifleNest,
      rows: [
        { label: 'Cost', value: '50' },
        { label: 'Damage', value: '10' },
        { label: 'Range', value: '2.5 tiles' },
        { label: 'Fire rate', value: '2/s' },
        { label: 'Hits', value: 'Ground, Air' },
      ],
    });
  });

  it('lists Ground first whatever the stats order, and shows only what a kind can hit', () => {
    expect(towerTooltip('aaGun').rows.at(-1)).toEqual({ label: 'Hits', value: 'Ground, Air' });
    expect(towerTooltip('cannon').rows.at(-1)).toEqual({ label: 'Hits', value: 'Ground' });
  });

  it("shows the Mortar's dead zone in its range, and its slow fire rate rounded", () => {
    const tip = towerTooltip('mortar');
    expect(tip.rows).toContainEqual({ label: 'Range', value: '1.5–5 tiles' });
    expect(tip.rows).toContainEqual({ label: 'Fire rate', value: '0.33/s' });
  });
});

describe('placeTip', () => {
  const viewport = { width: 800, height: 400 };
  const tip = { width: 180, height: 100 };
  const anchor = { left: 700, top: 50, width: 48, height: 60 };

  it('puts the tip left of the button, top-aligned', () => {
    expect(placeTip(anchor, tip, viewport)).toEqual({ left: 700 - TIP_GAP - 180, top: 50 });
  });

  it('keeps the tip inside the viewport', () => {
    expect(placeTip({ ...anchor, top: 380 }, tip, viewport).top).toBe(400 - TIP_GAP - 100);
    expect(placeTip({ ...anchor, left: 100 }, tip, viewport).left).toBe(TIP_GAP);
    expect(placeTip({ ...anchor, top: -20 }, tip, viewport).top).toBe(TIP_GAP);
  });

  it('moves below the tile it would cover', () => {
    const avoid = { left: 560, top: 40, width: 40, height: 40 };
    expect(placeTip(anchor, tip, viewport, avoid)).toEqual({ left: 700 - TIP_GAP - 180, top: 80 + TIP_GAP });
  });

  it('moves above the tile when there is no room below it', () => {
    const avoid = { left: 560, top: 300, width: 40, height: 40 };
    const low = { ...anchor, top: 280 };
    expect(placeTip(low, tip, viewport, avoid)).toEqual({ left: 700 - TIP_GAP - 180, top: 300 - TIP_GAP - 100 });
  });

  it('stays put when the tile is elsewhere', () => {
    const avoid = { left: 100, top: 40, width: 40, height: 40 };
    expect(placeTip(anchor, tip, viewport, avoid)).toEqual(placeTip(anchor, tip, viewport));
  });
});
