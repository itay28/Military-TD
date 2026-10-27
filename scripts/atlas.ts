import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

/** The packs whose PNGs go in the atlas. The UI pack stays out: its buttons are DOM, not canvas sprites. */
export const ATLAS_SOURCES = ['assets/kenney-tower-defense', 'assets/kenney-top-down-tanks'] as const;

/** Where `npm run atlas` writes the sheet and its frames, both committed. */
export const ATLAS_PNG = 'assets/atlas/sprites.png';
export const ATLAS_JSON = 'assets/atlas/sprites.json';

/**
 * Grid layout: every source fits a 64 px cell (Kenney's Default size), `padPx` apart so a scaled sprite never
 * samples its neighbour.
 */
export interface Layout {
  readonly cellPx: number;
  readonly padPx: number;
  readonly columns: number;
}

export const LAYOUT: Layout = { cellPx: 64, padPx: 2, columns: 8 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame in Phaser's JSON hash atlas format. */
export interface AtlasFrame {
  frame: Rect;
  rotated: false;
  trimmed: false;
  spriteSourceSize: Rect;
  sourceSize: { w: number; h: number };
}

/** The atlas JSON Phaser's `load.atlas` reads (JSON hash). */
export interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; format: 'RGBA8888'; size: { w: number; h: number }; scale: '1' };
}

export interface FrameSize {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** Each frame in its own grid cell, sorted by name so the output is the same on every run, and the sheet's size. */
export function packFrames(
  sizes: readonly FrameSize[],
  { cellPx, padPx, columns }: Layout,
): { frames: Record<string, AtlasFrame>; size: { w: number; h: number } } {
  const pitch = cellPx + padPx;
  const sorted = [...sizes].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const frames: Record<string, AtlasFrame> = {};
  sorted.forEach(({ name, width: w, height: h }, i) => {
    if (w > cellPx || h > cellPx) throw new Error(`${name} is ${w} × ${h}, bigger than a ${cellPx} px cell`);
    const frame = { x: (i % columns) * pitch, y: Math.floor(i / columns) * pitch, w, h };
    frames[name] = {
      frame,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
  });
  const usedColumns = Math.min(columns, sorted.length);
  const rows = Math.ceil(sorted.length / columns);
  return { frames, size: { w: usedColumns * pitch - padPx, h: rows * pitch - padPx } };
}

/** Reads every source PNG and packs them into one sheet: the PNG bytes and the JSON that names its frames. */
export function buildAtlas(): { png: Buffer; json: AtlasJson } {
  const images = new Map<string, PNG>();
  for (const dir of ATLAS_SOURCES) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
      const name = file.slice(0, -'.png'.length);
      if (images.has(name)) throw new Error(`Two source PNGs are named ${name}`);
      images.set(name, PNG.sync.read(readFileSync(join(dir, file))));
    }
  }
  const sizes = [...images].map(([name, { width, height }]) => ({ name, width, height }));
  const { frames, size } = packFrames(sizes, LAYOUT);
  const sheet = new PNG({ width: size.w, height: size.h }); // transparent
  for (const [name, { frame }] of Object.entries(frames)) {
    PNG.bitblt(images.get(name)!, sheet, 0, 0, frame.w, frame.h, frame.x, frame.y);
  }
  return {
    png: PNG.sync.write(sheet),
    json: { frames, meta: { image: 'sprites.png', format: 'RGBA8888', size, scale: '1' } },
  };
}

// CLI entry point: `npm run atlas` rebuilds the committed atlas after a source PNG changes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { png, json } = buildAtlas();
  mkdirSync('assets/atlas', { recursive: true });
  writeFileSync(ATLAS_PNG, png);
  writeFileSync(ATLAS_JSON, `${JSON.stringify(json, null, 2)}\n`);
  const { w, h } = json.meta.size;
  console.log(`${ATLAS_PNG}: ${Object.keys(json.frames).length} frames, ${w} × ${h}`);
}
