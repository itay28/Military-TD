import type { Faction } from '../sim/factions';

/**
 * A model's turntable (`scripts/render-sprite.py --turntable`, #407, #440): `frames` views of the whole model with its
 * ground shadow, from `elevationDeg` up, the camera orbiting clockwise `stepDeg` per frame from the model's front.
 * One sheet per model, `columns` frames wide, read left to right, top to bottom. For the Field manual's turning
 * model (`modelFor`, `src/data/modelViews.ts`), which loads the sheet when an entry opens; the Boot scene never does.
 */
export interface Turntable {
  readonly id: string;
  readonly kind: string;
  readonly faction: Faction;
  readonly url: string;
  readonly frames: number;
  readonly frameSize: number;
  readonly columns: number;
  readonly stepDeg: number;
  readonly elevationDeg: number;
}

/** The size budget of one turntable sheet (`render-sprite.py` steps the WebP quality down to fit it). */
export const TURNTABLE_BUDGET_BYTES = 300_000;

interface TurntableMeta {
  readonly id: string;
  readonly kind: string;
  readonly faction: Faction;
  readonly frames: number;
  readonly frameSize: number;
  readonly columns: number;
  readonly stepDeg: number;
  readonly elevationDeg: number;
}

const METAS = import.meta.glob<TurntableMeta>('../../assets/render-*/*-turntable.json', {
  eager: true,
  import: 'default',
});
/** Only the URLs Vite serves the sheets at: nothing is fetched until a scene loads one. */
const SHEETS = import.meta.glob<string>('../../assets/render-*/*-turntable.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Every model's turntable, by render id (`<faction>-<kind>`, as in `scripts/render-sprite.json`). */
export const TURNTABLES: Readonly<Record<string, Turntable>> = Object.fromEntries(
  Object.entries(METAS).map(([path, meta]) => {
    const url = SHEETS[path.replace(/\.json$/, '.webp')];
    if (url === undefined) throw new Error(`${path} has no sheet next to it`);
    const turntable: Turntable = {
      id: meta.id,
      kind: meta.kind,
      faction: meta.faction,
      url,
      frames: meta.frames,
      frameSize: meta.frameSize,
      columns: meta.columns,
      stepDeg: meta.stepDeg,
      elevationDeg: meta.elevationDeg,
    };
    return [meta.id, turntable];
  }),
);

/** The faction's turntable of `kind`, or null when that kind has no model yet. */
export function turntableFor(faction: Faction, kind: string): Turntable | null {
  return Object.values(TURNTABLES).find((t) => t.faction === faction && t.kind === kind) ?? null;
}
