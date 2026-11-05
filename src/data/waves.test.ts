import { describe, expect, it } from 'vitest';
import { validateWaves } from '../sim/waves';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { WAVES } from './waves';

/** Kinds not in any map yet: the Jet waits for its renders and rollout (#361, #366; ADR-0009). */
const NOT_PLAYABLE: readonly string[] = ['jet'];
const playableKinds = Object.keys(ENEMY_STATS).filter((k) => !NOT_PLAYABLE.includes(k));

const kindsIn = (wave: (typeof WAVES)[number]) => new Set(wave.groups.map((g) => g.kind));

describe('the wave schedule', () => {
  it('has 10 valid waves', () => {
    expect(WAVES).toHaveLength(10);
    expect(() => validateWaves(WAVES)).not.toThrow();
  });

  it('opens with 8 Infantry, 800 ms apart', () => {
    expect(WAVES[0]).toEqual({ groups: [{ kind: 'infantry', count: 8, spacingMs: 800, delayMs: 0 }] });
  });

  it('every enemy kind appears', () => {
    const seen = new Set(WAVES.flatMap((wave) => [...kindsIn(wave)]));
    expect([...seen].sort()).toEqual(playableKinds.sort());
  });

  it.each(playableKinds.filter((k) => k !== 'infantry') as EnemyKind[])(
    '%s first appears alone, at most 3 of it',
    (kind) => {
      const first = WAVES.find((wave) => kindsIn(wave).has(kind));
      expect([...kindsIn(first!)]).toEqual([kind]);
      expect(first!.groups.reduce((sum, g) => sum + g.count, 0)).toBeLessThanOrEqual(3);
    },
  );

  it('Infantry is the only kind in wave 1', () => {
    expect([...kindsIn(WAVES[0]!)]).toEqual(['infantry']);
  });
});
