import renderList from '../../scripts/render-sprite.json';
import type { Faction } from '../sim/factions';
import type { EnemyKind } from './enemies';
import type { TowerKind } from './towers';
import { TURNTABLES, type Turntable as TurntableData } from './turntables';

/** A turntable sheet (`src/data/turntables.ts`): `frames` square frames of `frameSize` px, `columns` per row. */
export type Turntable = Pick<TurntableData, 'url' | 'frames' | 'frameSize' | 'columns'>;

/** What the Field manual shows a model with: its turntable when there is one, else its top-down render, stacked. */
export interface ModelView {
  readonly turntable?: Turntable;
  /** Top-down images, bottom first, facing north: the fallback that turns in 2D. Empty when the model has none. */
  readonly layers: readonly string[];
}

// URLs only: nothing is fetched until the Field manual puts them in an <img>. Not in the Boot preload.
const TOP_DOWN = import.meta.glob<string>('../../assets/render-*/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** The model view of `kind` for `faction`, from the render list (`scripts/render-sprite.json`). */
export function modelFor(faction: Faction, kind: TowerKind | EnemyKind): ModelView {
  const model = renderList.models.find((m) => m.faction === faction && m.kind === kind);
  if (!model) return { layers: [] };
  const dir = `../../assets/render-${model.id}/${model.id}`;
  const single = TOP_DOWN[`${dir}.png`];
  const layers = single
    ? [single]
    : [TOP_DOWN[`${dir}-hull.png`], TOP_DOWN[`${dir}-turret.png`]].filter((u): u is string => !!u);
  const t = TURNTABLES[model.id];
  return t
    ? { turntable: { url: t.url, frames: t.frames, frameSize: t.frameSize, columns: t.columns }, layers }
    : { layers };
}
