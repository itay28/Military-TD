import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Faction } from '../sim/factions';
import { isUpcoming, modelFor } from './modelViews';
import { TURNTABLES, TURNTABLE_BUDGET_BYTES, turntableFor } from './turntables';

const config = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  models: { id: string; kind: string; faction: string }[];
};
const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as {
  packs: { id: string; name: string; attribution: string; files: string[] }[];
};
/** The factions rendered so far (#440 US, #442 Russia; #444, #445 add the others). */
const DONE: readonly Faction[] = ['us', 'russia'];
/** In-play models only: a kind whose art is ahead of its gameplay (`UPCOMING_KINDS`, e.g. the Heavy tank) gets its turntable later. */
const done = config.models.filter((m) => (DONE as readonly string[]).includes(m.faction) && !isUpcoming(m.kind));
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
  it('has a turntable for every model of the factions done so far, with its kind and faction', () => {
    expect(done.length).toBe(18); // eight kinds in play per Faction done, plus the US and Russia APCs (#478, #480)
    for (const m of done) {
      expect(TURNTABLES[m.id]!.kind, m.id).toBe(m.kind);
      expect(TURNTABLES[m.id]!.faction, m.id).toBe(m.faction);
    }
  });

  it('only holds turntables of models in render-sprite.json', () => {
    const ids = config.models.map((m) => m.id);
    for (const id of Object.keys(TURNTABLES)) expect(ids, id).toContain(id);
  });

  it('finds a faction’s turntable by kind', () => {
    for (const m of done) expect(turntableFor(m.faction as Faction, m.kind)?.id, m.id).toBe(m.id);
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

  it('serves each sheet by URL', () => {
    for (const t of Object.values(TURNTABLES)) expect(t.url).toMatch(new RegExp(`${t.id}-turntable\\.webp`));
  });

  it('has no turntable for a kind without a model', () => {
    expect(turntableFor('us', 'noSuchKind')).toBeNull();
  });
});

describe('modelFor', () => {
  it('gives the Field manual each turntable’s sheet URL and layout', () => {
    for (const m of done) {
      const t = TURNTABLES[m.id]!;
      expect(modelFor(m.faction as Faction, m.kind as never).turntable, m.id).toEqual({
        url: t.url,
        frames: 24,
        frameSize: 384,
        columns: t.columns,
      });
    }
  });
});

describe('turntables are loaded on demand', () => {
  it('stay out of the Boot preload: the Field manual loads them when it opens', () => {
    expect(readFileSync('src/scenes/BootScene.ts', 'utf8')).not.toMatch(/turntable/i);
  });
});

describe('turntable credits', () => {
  it('mentions the turntable in the manifest entry and License.txt of every render folder that has one', () => {
    for (const m of config.models.filter((x) => TURNTABLES[x.id] !== undefined)) {
      const entry = manifest.packs.find((a) => a.files.includes(`assets/render-${m.id}/**`));
      expect(entry, m.id).toBeDefined();
      expect(entry!.attribution, m.id).toMatch(/turntable/);
      expect(readFileSync(`assets/render-${m.id}/License.txt`, 'utf8'), m.id).toMatch(/turntable/);
    }
  });
});
