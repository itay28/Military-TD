/** A rectangle of an image, in its pixels. */
export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of an image worth drawing (#420): the box around every pixel more opaque than `faintAlpha` (0 to 255; by
 * default every pixel that isn't fully transparent), one pixel wider each side so smoothing at the box's edge blends
 * with the same pixels as before, within the image. `rgba` is the image's pixels, 4 bytes each, row by row. Undefined
 * when no pixel is that opaque.
 *
 * A render is a square canvas with the unit somewhere in it; drawing only this box spares software rendering (CI's
 * headless Chromium) the transparent rest.
 */
export function opaqueBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  faintAlpha = 0,
): PixelBox | undefined {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! <= faintAlpha) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return undefined;
  const x = Math.max(0, left - 1);
  const y = Math.max(0, top - 1);
  return { x, y, width: Math.min(width - 1, right + 1) - x + 1, height: Math.min(height - 1, bottom + 1) - y + 1 };
}
