import { describe, expect, it } from 'vitest';
import { validateWaves } from '../sim/waves';
import { ENEMY_STATS, NOT_PLAYABLE_KINDS, PLAYABLE_KINDS, type EnemyKind } from './enemies';
import { MAPS } from './maps';
import type { WaveData } from '../sim/waves';
import { waveRoadTimeMs } from '../sim/waves';
import {
  BUILD_WINDOW_MS,
  DEFAULT_WAVE_AFTER_MS,
  HAIRPIN_WAVES,
  SERPENTINE_WAVES,
  SWITCHBACK_WAVES,
  WAVE_TIMER,
  WAVES,
  timedWaves,
} from './waves';

const playableKinds: string[] = [...PLAYABLE_KINDS];

const kindsIn = (wave: (typeof WAVES)[number]) => new Set(wave.groups.map((g) => g.kind));

describe('the wave schedule', () => {
  it('has 20 valid waves', () => {
    expect(WAVES).toHaveLength(20);
    expect(() => validateWaves(WAVES)).not.toThrow();
  });

  it.each(MAPS)('$id: every map plays 20 waves (#381)', ({ waves }) => {
    expect(waves).toHaveLength(20);
    expect(() => validateWaves(waves)).not.toThrow();
  });

  /** A wave's total HP, the sum over its enemies. */
  const hp = (wave: WaveData) => wave.groups.reduce((sum, g) => sum + g.count * ENEMY_STATS[g.kind].maxHp, 0);

  it.each(MAPS)(
    "$id: builds up to its finale: the last wave has the most HP, and each half's last wave beats its first",
    ({ waves }) => {
      const finale = hp(waves.at(-1)!);
      for (const wave of waves.slice(0, -1)) expect(hp(wave)).toBeLessThan(finale);
      expect(hp(waves[9]!)).toBeGreaterThan(hp(waves[0]!));
      expect(hp(waves[19]!)).toBeGreaterThan(hp(waves[10]!));
    },
  );

  it('opens with 8 Infantry, 800 ms apart', () => {
    expect(WAVES[0]).toEqual({ groups: [{ kind: 'infantry', count: 8, spacingMs: 800, delayMs: 0 }] });
  });

  it('every enemy kind in play appears on some map', () => {
    const seen = new Set(MAPS.flatMap((map) => map.waves.flatMap((wave) => [...kindsIn(wave)])));
    expect([...seen].sort()).toEqual([...playableKinds].sort());
  });

  it('the Training Ground keeps the four starting kinds: the new ones come on later maps (#366)', () => {
    const seen = new Set(WAVES.flatMap((wave) => [...kindsIn(wave)]));
    expect([...seen].sort()).toEqual(['helicopter', 'infantry', 'jeep', 'tank']);
  });

  it("no map's waves have a kind that isn't playable yet", () => {
    const kinds = MAPS.flatMap((map) => map.waves.flatMap((wave) => [...kindsIn(wave)]));
    expect(kinds.filter((k) => NOT_PLAYABLE_KINDS.includes(k))).toEqual([]);
  });

  it.each(['jeep', 'tank', 'helicopter'] as EnemyKind[])('%s first appears alone, at most 3 of it', (kind) => {
    const first = WAVES.find((wave) => kindsIn(wave).has(kind));
    expect([...kindsIn(first!)]).toEqual([kind]);
    expect(first!.groups.reduce((sum, g) => sum + g.count, 0)).toBeLessThanOrEqual(3);
  });

  it('Infantry is the only kind in wave 1', () => {
    expect([...kindsIn(WAVES[0]!)]).toEqual(['infantry']);
  });
});

/** The new kinds on maps 2–4 (#366): each map's schedule brings them into its later waves. */
describe.each([
  ['Switchback', SWITCHBACK_WAVES],
  ['Serpentine', SERPENTINE_WAVES],
  ['Hairpin', HAIRPIN_WAVES],
] as const)('%s waves: the APC and the Fighter jet', (_name, waves) => {
  const firstWith = (kind: EnemyKind) => waves.findIndex((wave) => kindsIn(wave).has(kind));

  it('are valid', () => {
    expect(() => validateWaves(waves)).not.toThrow();
  });

  it.each(['apc', 'jet'] as EnemyKind[])('%s joins in waves 11–20, first in a small group of at most 3', (kind) => {
    const first = firstWith(kind);
    expect(first).toBeGreaterThanOrEqual(10);
    const groups = waves[first]!.groups.filter((g) => g.kind === kind);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBeLessThanOrEqual(3);
  });

  it.each(['apc', 'jet'] as EnemyKind[])('%s is in the last wave', (kind) => {
    expect(kindsIn(waves.at(-1)!).has(kind)).toBe(true);
  });
});

describe('the bosses (#366)', () => {
  const bossWaves = (waves: readonly (typeof WAVES)[number][]) =>
    waves.flatMap((wave, i) => (kindsIn(wave).has('heavyTank') ? [i] : []));

  it("one Heavy tank ends Hairpin's wave 20, its last: its group starts after every other group", () => {
    expect(bossWaves(HAIRPIN_WAVES)).toEqual([19]);
    const last = HAIRPIN_WAVES.at(-1)!.groups;
    const boss = last.find((g) => g.kind === 'heavyTank')!;
    expect(boss.count).toBe(1);
    for (const g of last.filter((g) => g !== boss)) expect(boss.delayMs).toBeGreaterThan(g.delayMs);
  });

  it('no other map has a boss before map 5 (#81)', () => {
    for (const waves of [WAVES, SWITCHBACK_WAVES, SERPENTINE_WAVES]) expect(bossWaves(waves)).toEqual([]);
    const kinds = MAPS.flatMap((map) => map.waves.flatMap((wave) => [...kindsIn(wave)]));
    expect(kinds).not.toContain('gunship');
  });
});

describe('timedWaves: wave timers that fit the road (#570)', () => {
  const ROAD = 30;
  const wave = (count: number, kind: EnemyKind = 'infantry'): WaveData => ({
    groups: [{ kind, count, spacingMs: 800, delayMs: 0 }],
  });
  const expected = (previous: WaveData, road: number) => {
    const raw = WAVE_TIMER.roadShare * waveRoadTimeMs(previous, road) + WAVE_TIMER.extraMs;
    return Math.min(WAVE_TIMER.maxMs, Math.max(WAVE_TIMER.minMs, Math.round(raw / 1000) * 1000));
  };

  it('the fallback timer is under the old flat 40 s', () => {
    expect(DEFAULT_WAVE_AFTER_MS).toBeLessThan(40_000);
  });

  it('wave 1 gets the build window, each later one a share of the time the wave before takes on the road', () => {
    const waves = [wave(8), wave(12), wave(1, 'tank')];
    const timed = timedWaves(waves, ROAD);
    expect(timed.map((w) => w.afterMs)).toEqual([
      BUILD_WINDOW_MS,
      expected(waves[0]!, ROAD),
      expected(waves[1]!, ROAD),
    ]);
    expect(timed.map((w) => w.groups)).toEqual(waves.map((w) => w.groups));
  });

  it('rounds to the whole second and stays within its bounds', () => {
    const timed = timedWaves([wave(1, 'jeep'), wave(1), wave(1, 'tank'), wave(1)], 200);
    for (const { afterMs } of timed.slice(1)) {
      expect(afterMs! % 1000).toBe(0);
      expect(afterMs).toBeGreaterThanOrEqual(WAVE_TIMER.minMs);
      expect(afterMs).toBeLessThanOrEqual(WAVE_TIMER.maxMs);
    }
    expect(timedWaves([wave(1, 'jeep'), wave(1)], 1)[1]!.afterMs).toBe(WAVE_TIMER.minMs);
    expect(timed[3]!.afterMs).toBe(WAVE_TIMER.maxMs);
  });

  it('keeps a timer the wave data sets itself', () => {
    const timed = timedWaves(
      [
        { ...wave(8), afterMs: 5000 },
        { ...wave(8), afterMs: 7000 },
      ],
      ROAD,
    );
    expect(timed.map((w) => w.afterMs)).toEqual([5000, 7000]);
  });

  it('a longer road gets longer timers', () => {
    const waves = [wave(8), wave(12), wave(10)];
    const total = (road: number) => timedWaves(waves, road).reduce((sum, w) => sum + w.afterMs!, 0);
    expect(total(50)).toBeGreaterThan(total(25));
  });
});
