import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../sim/factions';
import { TURNTABLES, TURNTABLE_BUDGET_BYTES, loadTurntable, turntableFor, turntableKey } from './turntables';

const config = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  models: { id: string; kind: string; faction: string }[];
};
const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as {
  packs: { id: string; name: string; attribution: string; files: string[] }[];
};
const sheetPath = (id: string): string => `assets/render-${id}/${id}-turntable.webp`;

/** Width and height from a WebP's header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

describe('TURNTABLES', () => {
  it('has a turntable for every model in render-sprite.json, with its kind and faction', () => {
    expect(Object.keys(TURNTABLES).sort()).toEqual(config.models.map((m) => m.id).sort());
    for (const m of config.models) {
      expect(TURNTABLES[m.id]!.kind, m.id).toBe(m.kind);
      expect(TURNTABLES[m.id]!.faction, m.id).toBe(m.faction);
    }
  });

  it('covers every kind for each of the four factions', () => {
    const kinds = new Set(config.models.map((m) => m.kind));
    for (const faction of FACTIONS)
      for (const kind of kinds) expect(turntableFor(faction, kind), `${faction} ${kind}`).not.toBeNull();
  });

  it('is 24 frames of 384 px, 15° apart, from 30° up', () => {
    for (const t of Object.values(TURNTABLES)) {
      expect(t.frames, t.id).toBe(24);
      expect(t.frameSize, t.id).toBe(384);
      expect(t.stepDeg, t.id).toBe(15);
      expect(t.elevationDeg, t.id).toBe(30);
    }
  });

  it('matches each sheet’s real size: columns × rows of frames', () => {
    for (const t of Object.values(TURNTABLES)) {
      expect(webpSize(sheetPath(t.id)), t.id).toEqual({
        width: t.columns * t.frameSize,
        height: Math.ceil(t.frames / t.columns) * t.frameSize,
      });
    }
  });

  it('keeps every sheet within the budget of about 300 KB per model', () => {
    expect(TURNTABLE_BUDGET_BYTES).toBe(300_000);
    for (const t of Object.values(TURNTABLES))
      expect(statSync(sheetPath(t.id)).size, t.id).toBeLessThanOrEqual(TURNTABLE_BUDGET_BYTES);
  });

  it('serves each sheet by URL under its own texture key', () => {
    for (const t of Object.values(TURNTABLES)) {
      expect(t.key).toBe(turntableKey(t.id));
      expect(t.url).toMatch(new RegExp(`${t.id}-turntable\\.webp`));
    }
  });

  it('has no turntable for a kind without a model', () => {
    expect(turntableFor('us', 'noSuchKind')).toBeNull();
  });
});

describe('loadTurntable', () => {
  it('queues the sheet as a spritesheet of its frame size', () => {
    const calls: unknown[][] = [];
    const t = TURNTABLES['us-tank']!;
    loadTurntable({ spritesheet: (...args: unknown[]) => void calls.push(args) }, t);
    expect(calls).toEqual([[t.key, t.url, { frameWidth: 384, frameHeight: 384, endFrame: 23 }]]);
  });
});

describe('turntables are loaded on demand', () => {
  it('stay out of the Boot preload: the Field manual loads them when it opens', () => {
    expect(readFileSync('src/scenes/BootScene.ts', 'utf8')).not.toMatch(/turntable/i);
  });
});

describe('turntable credits', () => {
  it('mentions the turntable in every render folder’s manifest entry and License.txt', () => {
    for (const m of config.models) {
      const entry = manifest.packs.find((a) => a.files.includes(`assets/render-${m.id}/**`));
      expect(entry, m.id).toBeDefined();
      expect(entry!.attribution, m.id).toMatch(/turntable/);
      expect(readFileSync(`assets/render-${m.id}/License.txt`, 'utf8'), m.id).toMatch(/turntable/);
    }
  });
});
