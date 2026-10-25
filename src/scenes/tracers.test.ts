import { describe, expect, it } from 'vitest';
import { createTracers } from './tracers';

const FROM = { x: 0, y: 0 };
const TO = { x: 100, y: 50 };

describe('createTracers', () => {
  it('shows a new tracer fully opaque, from the tower to the target', () => {
    const tracers = createTracers(80);
    tracers.add(FROM, TO);
    expect(tracers.active()).toEqual([{ from: FROM, to: TO, alpha: 1 }]);
  });

  it('fades a tracer linearly over the fade time', () => {
    const tracers = createTracers(80);
    tracers.add(FROM, TO);
    tracers.advance(20);
    expect(tracers.active()[0]?.alpha).toBeCloseTo(0.75);
    tracers.advance(40);
    expect(tracers.active()[0]?.alpha).toBeCloseTo(0.25);
  });

  it('drops a tracer once it has faded out', () => {
    const tracers = createTracers(80);
    tracers.add(FROM, TO);
    tracers.advance(80);
    expect(tracers.active()).toEqual([]);
  });

  it('fades several tracers independently', () => {
    const tracers = createTracers(80);
    tracers.add(FROM, TO);
    tracers.advance(60);
    tracers.add(TO, FROM);
    tracers.advance(40);
    expect(tracers.active()).toEqual([{ from: TO, to: FROM, alpha: 0.5 }]);
  });
});
