import { describe, expect, it } from 'vitest';
import { createFloatingTexts } from './floatingTexts';

const AT = { x: 100, y: 200 };

describe('createFloatingTexts', () => {
  it('shows a new text fully opaque at the point it was added', () => {
    const texts = createFloatingTexts({ durationMs: 1000, risePx: 40 });
    texts.add('Not enough money', AT);
    expect(texts.active()).toEqual([{ id: expect.any(Number), text: 'Not enough money', x: 100, y: 200, alpha: 1 }]);
  });

  it('rises and fades linearly over its duration', () => {
    const texts = createFloatingTexts({ durationMs: 1000, risePx: 40 });
    texts.add('Tile occupied', AT);
    texts.advance(250);
    expect(texts.active()[0]).toMatchObject({ x: 100, y: 190, alpha: 0.75 });
    texts.advance(500);
    expect(texts.active()[0]).toMatchObject({ x: 100, y: 170, alpha: 0.25 });
  });

  it('drops a text once its duration is up', () => {
    const texts = createFloatingTexts({ durationMs: 1000, risePx: 40 });
    texts.add('Tile occupied', AT);
    texts.advance(1000);
    expect(texts.active()).toEqual([]);
  });

  it('keeps several texts apart, each with its own id and age', () => {
    const texts = createFloatingTexts({ durationMs: 1000, risePx: 40 });
    texts.add('first', AT);
    texts.advance(800);
    texts.add('second', AT);
    texts.advance(100);
    const [first, second] = texts.active();
    expect(first).toMatchObject({ text: 'first', alpha: expect.closeTo(0.1) });
    expect(second).toMatchObject({ text: 'second', alpha: expect.closeTo(0.9) });
    expect(first?.id).not.toBe(second?.id);
  });

  it('never shows a text with no duration, for ?anim=0', () => {
    const texts = createFloatingTexts({ durationMs: 0, risePx: 40 });
    texts.add('hidden', AT);
    expect(texts.active()).toEqual([]);
  });
});
