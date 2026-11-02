import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

/** One model in `scripts/render-sprite.json`, as far as the game needs it. */
export interface RenderModel {
  readonly id: string;
  readonly kind: string;
  /** The Faction whose set this render belongs to (ADR-0009). */
  readonly faction: string;
  readonly canvasTiles: number;
  /** Which meshes turn (`render-sprite.py`); a kind with no turning part (Infantry, Jeep, Helicopter) has none. */
  readonly turret?: unknown;
  /** The sandbagged pit a tower stands in (`render-sprite.py` builds it at the canvas centre). */
  readonly base?: unknown;
}

export const RENDER_CONFIG = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  readonly pxPerTile: number;
  readonly models: readonly RenderModel[];
};

/** A point on a render's canvas in pixels, from its top-left corner (pixel edges: the centre of 128 px is 64). */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What the game reads for each render (`src/data/renders.ts`): its kind, its scale and, when it has a turret,
 * the turret's pivot.
 */
export interface RenderMeta {
  readonly id: string;
  readonly kind: string;
  readonly pxPerTile: number;
  readonly canvasPx: number;
  readonly pivot?: CanvasPoint;
}

/** Pixels at least this opaque count as the turret; softer ones are anti-aliasing and denoiser haze. */
const OPAQUE = 128;
/** A row belongs to the turret body when it is at least this share of the widest row; thinner rows are barrels. */
const BODY_SHARE = 0.5;

/**
 * Where the turret turns: the centre of its body, the box around the rows at least half as wide as the widest,
 * so a long thin barrel doesn't pull it forward. `render-sprite.py` frames the whole model, not the turret ring,
 * so this is rarely the canvas centre.
 */
export function turretPivot({ width, height, data }: Pick<PNG, 'width' | 'height' | 'data'>): CanvasPoint {
  const rows: { y: number; from: number; to: number }[] = [];
  for (let y = 0; y < height; y++) {
    let from = -1;
    let to = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < OPAQUE) continue;
      if (from < 0) from = x;
      to = x;
    }
    if (from >= 0) rows.push({ y, from, to });
  }
  if (rows.length === 0) throw new Error('The turret has no opaque pixel');
  const widest = Math.max(...rows.map((r) => r.to - r.from + 1));
  const body = rows.filter((r) => r.to - r.from + 1 >= widest * BODY_SHARE);
  const left = Math.min(...body.map((r) => r.from));
  const right = Math.max(...body.map((r) => r.to)) + 1;
  const top = body[0]!.y;
  const bottom = body.at(-1)!.y + 1;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** Where a model's render data lives, next to its PNGs. */
export const renderMetaPath = (id: string): string => `assets/render-${id}/${id}.json`;

/**
 * One model's render data; `readTurret` loads its `<id>-turret.png`, read only when the pivot is measured. A tower
 * on a `base` turns about the pit's centre, which is the canvas centre: its weapon (a rifle team, a mortar, a
 * tripod launcher) has no long barrel to measure the body from.
 */
export function renderMeta(
  model: Omit<RenderModel, 'faction'>,
  pxPerTile: number,
  readTurret: (id: string) => PNG,
): RenderMeta {
  const { id, kind, canvasTiles } = model;
  const canvasPx = Math.round(canvasTiles * pxPerTile);
  if (model.turret === undefined) return { id, kind, pxPerTile, canvasPx };
  if (model.base !== undefined) return { id, kind, pxPerTile, canvasPx, pivot: { x: canvasPx / 2, y: canvasPx / 2 } };
  const turret = readTurret(id);
  if (turret.width !== canvasPx || turret.height !== canvasPx) {
    throw new Error(`${id}-turret.png is ${turret.width} × ${turret.height}, not the ${canvasPx} px canvas`);
  }
  return { id, kind, pxPerTile, canvasPx, pivot: turretPivot(turret) };
}

const readTurretPng = (id: string): PNG => PNG.sync.read(readFileSync(`assets/render-${id}/${id}-turret.png`));

/** Every model's render data, from `render-sprite.json` and its committed turret PNG. */
export function buildRenderMeta(): { path: string; json: RenderMeta }[] {
  const { pxPerTile, models } = RENDER_CONFIG;
  return models.map((model) => ({ path: renderMetaPath(model.id), json: renderMeta(model, pxPerTile, readTurretPng) }));
}

// CLI entry point: `npm run render:pivot` rewrites each render's JSON after `render-sprite.py` renders it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { path, json } of buildRenderMeta()) {
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
    console.log(
      `${path}: ${json.pivot ? `pivot (${json.pivot.x}, ${json.pivot.y})` : 'no turret'} on ${json.canvasPx} px`,
    );
  }
}
