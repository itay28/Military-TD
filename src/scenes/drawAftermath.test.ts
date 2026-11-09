import { describe, expect, it } from 'vitest';
import { AFTERMATH } from '../data/display';
import type { DecalView } from './aftermath';
import type { Pixel } from './coords';
import { drawAftermath, rotatedRect, type AftermathPainter } from './drawAftermath';

type Call = { name: string; args: unknown[] };

/** Records every painter call in order, with its arguments. */
function recordingPainter() {
  const calls: Call[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });
  const painter: AftermathPainter = {
    fillStyle: record('fillStyle'),
    fillCircle: record('fillCircle'),
    fillRect: record('fillRect'),
    lineStyle: record('lineStyle'),
    strokeRect: record('strokeRect'),
    strokeCircle: record('strokeCircle'),
    lineBetween: record('lineBetween'),
    fillPoints: record('fillPoints'),
  };
  return { painter, calls };
}

const decal = (overrides: Partial<DecalView>): DecalView => ({
  kind: 'wreck',
  at: { x: 100, y: 50 },
  heading: 0,
  size: 10,
  alpha: 1,
  fireMs: undefined,
  fall: 1,
  ...overrides,
});

const styles = (calls: Call[]) => calls.filter((c) => c.name === 'fillStyle').map((c) => c.args as [number, number]);

describe('rotatedRect', () => {
  it('lies along its heading', () => {
    const round = (points: Pixel[]) => points.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
    expect(round(rotatedRect({ x: 0, y: 0 }, 4, 2, 0))).toEqual([
      { x: 4, y: 2 },
      { x: 4, y: -2 },
      { x: -4, y: -2 },
      { x: -4, y: 2 },
    ]);
    expect(round(rotatedRect({ x: 10, y: 10 }, 4, 2, Math.PI / 2))).toEqual([
      { x: 8, y: 14 },
      { x: 12, y: 14 },
      { x: 12, y: 6 },
      { x: 8, y: 6 },
    ]);
  });
});

describe('drawAftermath', () => {
  it('draws nothing with no decals', () => {
    const { painter, calls } = recordingPainter();
    drawAftermath(painter, []);
    expect(calls).toEqual([]);
  });

  it.each(['wreck', 'crashMark', 'crater', 'fallen'] as const)('draws a %s faded by its alpha', (kind) => {
    const opaque = recordingPainter();
    drawAftermath(opaque.painter, [decal({ kind })]);
    const faded = recordingPainter();
    drawAftermath(faded.painter, [decal({ kind, alpha: 0.5 })]);
    expect(styles(opaque.calls).length).toBeGreaterThan(0);
    expect(styles(faded.calls)).toEqual(styles(opaque.calls).map(([color, alpha]) => [color, alpha * 0.5]));
  });

  it('draws fire and smoke only while the wreck burns', () => {
    const fireColors: number[] = [...AFTERMATH.fire.colors, AFTERMATH.smoke.color];
    const out = recordingPainter();
    drawAftermath(out.painter, [decal({})]);
    expect(styles(out.calls).some(([color]) => fireColors.includes(color))).toBe(false);
    const burning = recordingPainter();
    drawAftermath(burning.painter, [decal({ fireMs: 500 })]);
    expect(styles(burning.calls).some(([color]) => fireColors.includes(color))).toBe(true);
  });

  it('flickers the same for the same burn age', () => {
    const a = recordingPainter();
    const b = recordingPainter();
    drawAftermath(a.painter, [decal({ fireMs: 700 })]);
    drawAftermath(b.painter, [decal({ fireMs: 700 })]);
    expect(a.calls).toEqual(b.calls);
  });

  it('lays fallen infantry out longer as they tip over', () => {
    const lengthAt = (fall: number) => {
      const { painter, calls } = recordingPainter();
      drawAftermath(painter, [decal({ kind: 'fallen', fall })]);
      const [a, , c] = calls.find((call) => call.name === 'fillPoints')!.args[0] as Pixel[];
      return Math.hypot(a!.x - c!.x, a!.y - c!.y);
    };
    expect(lengthAt(1)).toBeGreaterThan(lengthAt(0));
  });

  it('draws in no red: no blood', () => {
    const { painter, calls } = recordingPainter();
    drawAftermath(painter, [decal({ kind: 'fallen' })]);
    for (const [color] of styles(calls)) {
      const r = color >> 16;
      const g = (color >> 8) & 0xff;
      expect(r - g).toBeLessThan(40);
    }
  });
});
