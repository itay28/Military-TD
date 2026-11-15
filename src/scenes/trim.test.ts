import { describe, expect, it } from 'vitest';
import { opaqueBounds } from './trim';

/** RGBA pixels of a `width` × `height` image, transparent but for the listed [x, y, alpha] pixels. */
function image(width: number, height: number, opaque: [number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of opaque) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe('opaqueBounds', () => {
  it('is the box around every pixel that is not fully transparent, one pixel wider each side', () => {
    expect(
      opaqueBounds(
        image(10, 8, [
          [3, 2, 255],
          [6, 5, 1],
        ]),
        10,
        8,
      ),
    ).toEqual({ x: 2, y: 1, width: 6, height: 6 });
  });

  it('stops the margin at the image edges', () => {
    expect(
      opaqueBounds(
        image(4, 4, [
          [0, 0, 255],
          [3, 3, 9],
        ]),
        4,
        4,
      ),
    ).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });

  it('counts any pixel that is not fully transparent by default', () => {
    expect(
      opaqueBounds(
        image(5, 5, [
          [2, 2, 255],
          [4, 0, 1],
        ]),
        5,
        5,
      ),
    ).toEqual({ x: 1, y: 0, width: 4, height: 4 });
  });

  it('leaves out pixels as faint as `faintAlpha` or fainter, such as the edge of a soft shadow', () => {
    const pixels = image(6, 6, [
      [3, 3, 255],
      [0, 0, 4],
      [5, 5, 5],
    ]);
    expect(opaqueBounds(pixels, 6, 6, 4)).toEqual({ x: 2, y: 2, width: 4, height: 4 });
  });

  it('is undefined for a fully transparent image', () => {
    expect(opaqueBounds(image(3, 3, []), 3, 3)).toBeUndefined();
  });
});
