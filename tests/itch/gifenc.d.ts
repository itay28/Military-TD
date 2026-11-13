// gifenc ships no types; these cover what the capture spec uses.
declare module 'gifenc' {
  export type Palette = number[][];
  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  const gifenc: {
    GIFEncoder(): Encoder;
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string }): Palette;
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
  };
  export default gifenc;
}
