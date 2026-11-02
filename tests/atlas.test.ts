import { readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ATLAS_SOURCES, buildAtlas, packFrames, type AtlasJson } from '../scripts/atlas';

describe('packFrames', () => {
  const sizes = [
    { name: 'b', width: 64, height: 64 },
    { name: 'a', width: 38, height: 36 },
    { name: 'c', width: 12, height: 26 },
  ];

  it('puts each frame in its own cell, by name, at its own size', () => {
    const { frames } = packFrames(sizes, { cellPx: 64, padPx: 2, columns: 2 });
    expect(Object.keys(frames)).toEqual(['a', 'b', 'c']);
    expect(frames['a']!.frame).toEqual({ x: 0, y: 0, w: 38, h: 36 });
    expect(frames['b']!.frame).toEqual({ x: 66, y: 0, w: 64, h: 64 });
    expect(frames['c']!.frame).toEqual({ x: 0, y: 66, w: 12, h: 26 });
  });

  it('sizes the sheet to fit every cell', () => {
    const { size, frames } = packFrames(sizes, { cellPx: 64, padPx: 2, columns: 2 });
    expect(size).toEqual({ w: 130, h: 130 });
    for (const { frame } of Object.values(frames)) {
      expect(frame.x + frame.w).toBeLessThanOrEqual(size.w);
      expect(frame.y + frame.h).toBeLessThanOrEqual(size.h);
    }
  });

  it('refuses a source bigger than a cell', () => {
    expect(() => packFrames([{ name: 'big', width: 65, height: 10 }], { cellPx: 64, padPx: 2, columns: 2 })).toThrow(
      /big/,
    );
  });
});

// The committed atlas is what `npm run atlas` builds from assets/, so it can't drift from the packs.
describe('assets/atlas', () => {
  const json = JSON.parse(readFileSync('assets/atlas/sprites.json', 'utf8')) as AtlasJson;

  it('has a frame for every source PNG', () => {
    const names = ATLAS_SOURCES.flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith('.png'))
        .map((file) => file.slice(0, -'.png'.length)),
    );
    expect(Object.keys(json.frames).sort()).toEqual(names.sort());
  });

  it('matches a fresh build, frames and pixels', () => {
    const fresh = buildAtlas();
    expect(json).toEqual(fresh.json);
    const committed = PNG.sync.read(readFileSync('assets/atlas/sprites.png'));
    expect(committed.width).toBe(fresh.json.meta.size.w);
    expect(committed.height).toBe(fresh.json.meta.size.h);
    expect(Buffer.compare(committed.data, PNG.sync.read(fresh.png).data)).toBe(0);
  });
});
