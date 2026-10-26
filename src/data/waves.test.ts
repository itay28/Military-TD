import { describe, expect, it } from 'vitest';
import { validateWaves } from '../sim/waves';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { WAVES } from './waves';

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
    expect([...seen].sort()).toEqual(Object.keys(ENEMY_STATS).sort());
  });

  it.each(Object.keys(ENEMY_STATS).filter((k) => k !== 'infantry') as EnemyKind[])(
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
