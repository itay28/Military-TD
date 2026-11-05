import type { Faction } from '../sim/factions';

/**
 * A model's turntable (`scripts/render-sprite.py --turntable`, #407): `frames` views of the whole model with its
 * ground shadow, from `elevationDeg` up, the camera orbiting clockwise `stepDeg` per frame from the model's front.
 * One sheet per model, `columns` frames wide, read left to right, top to bottom. For the Field manual's rotating
 * model view, which loads it when it opens (`loadTurntable`); the Boot scene never does.
 */
export interface Turntable {
  readonly id: string;
  readonly kind: string;
  readonly faction: Faction;
  readonly key: string;
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

/** The texture key a turntable sheet loads under. */
export const turntableKey = (id: string): string => `turntable-${id}`;

/** Every model's turntable, by render id (`<faction>-<kind>`, as in `scripts/render-sprite.json`). */
export const TURNTABLES: Readonly<Record<string, Turntable>> = Object.fromEntries(
  Object.entries(METAS).map(([path, meta]) => {
    const url = SHEETS[path.replace(/\.json$/, '.webp')];
    if (url === undefined) throw new Error(`${path} has no sheet next to it`);
    const turntable: Turntable = {
      id: meta.id,
      kind: meta.kind,
      faction: meta.faction,
      key: turntableKey(meta.id),
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

/** The part of Phaser's loader `loadTurntable` uses. */
export interface SpritesheetLoader {
  spritesheet(key: string, url: string, config: { frameWidth: number; frameHeight: number; endFrame: number }): unknown;
}

/** Queue a turntable's sheet as a spritesheet, one frame per view (call it when the Field manual opens). */
export function loadTurntable(loader: SpritesheetLoader, t: Turntable): void {
  loader.spritesheet(t.key, t.url, { frameWidth: t.frameSize, frameHeight: t.frameSize, endFrame: t.frames - 1 });
}
