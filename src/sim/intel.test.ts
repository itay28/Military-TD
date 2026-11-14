import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { intelDepth, waveComposition, waveIntel, type IntelTower } from './intel';
import { towerLevels } from './towers';
import { createSpawnSchedule, type WaveData, type WaveGroup } from './waves';

const group = (kind: WaveGroup['kind'], count: number, delayMs = 0, spacingMs = 500): WaveGroup => ({
  kind,
  count,
  spacingMs,
  delayMs,
});

describe('waveComposition', () => {
  it('lists each kind once with its count', () => {
    expect(waveComposition({ groups: [group('infantry', 8)] })).toEqual([{ kind: 'infantry', count: 8 }]);
  });

  it("sums a kind's groups and lists the kinds in order of first appearance", () => {
    const wave: WaveData = {
      groups: [group('tank', 2, 50_000), group('infantry', 20, 4000), group('tank', 5, 0), group('jeep', 3, 2000)],
    };
    expect(waveComposition(wave)).toEqual([
      { kind: 'tank', count: 7 },
      { kind: 'jeep', count: 3 },
      { kind: 'infantry', count: 20 },
    ]);
  });

  it('kinds that first appear at the same time keep group order', () => {
    expect(waveComposition({ groups: [group('helicopter', 2, 1000), group('jeep', 4, 1000)] })).toEqual([
      { kind: 'helicopter', count: 2 },
      { kind: 'jeep', count: 4 },
    ]);
  });

  // An independent oracle: every spawn of the wave, in the order the spawn schedule releases them.
  const fromSpawns = (wave: WaveData) => {
    const counts = new Map<string, number>();
    for (const { kind } of createSpawnSchedule(wave).take(Number.MAX_SAFE_INTEGER))
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [...counts].map(([kind, count]) => ({ kind, count }));
  };

  for (const map of MAPS)
    it(`matches the spawns of every wave on ${map.id}`, () => {
      map.waves.forEach((wave, i) => expect(waveComposition(wave), `wave ${i + 1}`).toEqual(fromSpawns(wave)));
    });
});

describe('intelDepth', () => {
  const sniper = (level = 1, dismantleMs?: number): IntelTower =>
    dismantleMs === undefined ? { kind: 'sniper', level } : { kind: 'sniper', level, dismantleMs };
  const top = towerLevels('sniper').length;

  it('is 0 without a Sniper', () => {
    expect(intelDepth([])).toBe(0);
    expect(
      intelDepth([
        { kind: 'rifleNest', level: 2 },
        { kind: 'cannon', level: 1 },
      ]),
    ).toBe(0);
  });

  it('a Sniper reports the next wave', () => {
    expect(intelDepth([{ kind: 'rifleNest', level: 1 }, sniper()])).toBe(1);
  });

  it('a level-3 Sniper reports the wave after next as well', () => {
    expect(top).toBe(3);
    expect(intelDepth([sniper(2)])).toBe(1);
    expect(intelDepth([sniper(), sniper(3)])).toBe(2);
  });

  it('a Sniper being dismantled reports nothing', () => {
    expect(intelDepth([sniper(1, 500)])).toBe(0);
    expect(intelDepth([sniper(top, 500), sniper()])).toBe(1);
  });
});

describe('waveIntel', () => {
  const waves: WaveData[] = [
    { groups: [group('infantry', 8)] },
    { groups: [group('jeep', 3)] },
    { groups: [group('tank', 1), group('infantry', 4, 1000)] },
  ];

  it('reports nothing with depth 0', () => {
    expect(waveIntel(waves, 0, 0)).toEqual([]);
  });

  it('reports the next `depth` waves, numbered from 1', () => {
    expect(waveIntel(waves, 0, 1)).toEqual([{ waveNumber: 1, composition: [{ kind: 'infantry', count: 8 }] }]);
    expect(waveIntel(waves, 1, 2)).toEqual([
      { waveNumber: 2, composition: [{ kind: 'jeep', count: 3 }] },
      {
        waveNumber: 3,
        composition: [
          { kind: 'tank', count: 1 },
          { kind: 'infantry', count: 4 },
        ],
      },
    ]);
  });

  it('stops at the end of the schedule', () => {
    expect(waveIntel(waves, 2, 2).map((w) => w.waveNumber)).toEqual([3]);
    expect(waveIntel(waves, 3, 2)).toEqual([]);
  });
});
