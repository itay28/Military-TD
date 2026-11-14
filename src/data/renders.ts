import type { Faction } from '../sim/factions';
import { PLAYABLE_KINDS } from './enemies';
import type { SpriteKind } from './sprites';
import { BUILD_KINDS, TOWER_STATS } from './towers';

/** What every render has (ADR-0009, `scripts/render-sprite.py`, `npm run render:pivot` → `assets/render-<id>/<id>.json`). */
interface RenderBase {
  /** `<faction>-<kind in kebab case>`, as in `scripts/render-sprite.json`. */
  readonly id: string;
  readonly kind: SpriteKind;
  readonly faction: Faction;
  /** Sizes are in canvas pixels at `pxPerTile`. */
  readonly pxPerTile: number;
  readonly canvasPx: number;
  /** What the model turns about; the canvas centre when its metadata has none. */
  readonly pivot: { readonly x: number; readonly y: number };
}

/** A hull with its shadow and a turret over it that turns around `pivot`: the towers and the Tank. */
export interface RenderedSprite extends RenderBase {
  readonly hullKey: string;
  readonly hullUrl: string;
  readonly turretKey: string;
  readonly turretUrl: string;
  /**
   * Barrel tips, in canvas pixels from the pivot with the turret facing north (so −y is forward): one per barrel,
   * where its flash and tracer start. Measured from the turret image; purely cosmetic.
   */
  readonly muzzles: readonly { readonly x: number; readonly y: number }[];
}

/** One image with its shadow, turned whole: Infantry, Jeep and Helicopter. */
export interface SingleImageRender extends RenderBase {
  readonly imageKey: string;
  readonly imageUrl: string;
}

export type AnyRender = RenderedSprite | SingleImageRender;

export const isTurretRender = (render: AnyRender): render is RenderedSprite => 'turretKey' in render;

/**
 * Barrel tips per turret render id, from the topmost opaque pixels of each turret image (the test checks each is one).
 * Where the top rows hold more than barrels (a cannon's shield, a mortar's bipod legs), only the barrel counts.
 */
const MUZZLES: Record<string, RenderedSprite['muzzles']> = {
  // Twin barrels: tips at x 76 and 82 on a 160 px canvas pivoting at (80, 80), top row 21.
  'china-aa-gun': [
    { x: -4, y: -59 },
    { x: 2, y: -59 },
  ],
  'russia-aa-gun': [
    { x: -3.5, y: -61 },
    { x: 3, y: -61 },
  ],
  'insurgents-aa-gun': [
    { x: -3.5, y: -61 },
    { x: 3, y: -61 },
  ],
  'us-aa-gun': [{ x: 0, y: -45 }],
  'us-cannon': [{ x: 9.5, y: -38 }],
  'russia-cannon': [{ x: -8, y: -60 }],
  'china-cannon': [{ x: 9.5, y: -38 }],
  // The middle tube; the two outer lines are its shield.
  'insurgents-cannon': [{ x: 0, y: -50 }],
  // The middle tube; the two outer lines are its bipod legs.
  'us-mortar': [{ x: 1, y: -34 }],
  'russia-mortar': [{ x: 0, y: -41 }],
  'china-mortar': [{ x: 0, y: -41 }],
  'insurgents-mortar': [{ x: 0, y: -41 }],
  // Two riflemen, one either side of the pad.
  'us-rifle-nest': [
    { x: -31, y: -8 },
    { x: 17, y: -4 },
  ],
  'russia-rifle-nest': [
    { x: -31, y: -8 },
    { x: 17, y: -4 },
  ],
  'china-rifle-nest': [
    { x: -31, y: -8 },
    { x: 17, y: -4 },
  ],
  'insurgents-rifle-nest': [
    { x: -31, y: -8 },
    { x: 17, y: -4 },
  ],
  // One barrel each.
  'us-tank': [{ x: -2.5, y: -107 }],
  // Tip at x 95.5, top row 12, pivot (95.5, 116.5).
  'russia-tank': [{ x: 0, y: -104.5 }],
  'china-tank': [{ x: -0.5, y: -100 }],
  'insurgents-tank': [{ x: 0, y: -96.5 }],
  // One barrel each (top row 19 of the turret image).
  // Grenade launchers: one barrel each, tips read off the turret image (top row 41, 42, 53 and 39).
  'us-grenade-launcher': [{ x: 3, y: -39 }],
  'russia-grenade-launcher': [{ x: -0.5, y: -38 }],
  'china-grenade-launcher': [{ x: -3, y: -27 }],
  'insurgents-grenade-launcher': [{ x: -0.5, y: -41 }],
  'us-heavy-tank': [{ x: -0.5, y: -116 }],
  'russia-heavy-tank': [{ x: -0.5, y: -120 }],
  'china-heavy-tank': [{ x: -0.5, y: -108 }],
  'insurgents-heavy-tank': [{ x: -1, y: -117.5 }],
};

interface RenderMeta {
  readonly id: string;
  readonly kind: string;
  readonly pxPerTile: number;
  readonly canvasPx: number;
  readonly pivot?: { readonly x: number; readonly y: number };
}

const METAS = import.meta.glob<RenderMeta>(
  ['../../assets/render-*/*.json', '!../../assets/render-*/*-turntable.json'],
  {
    eager: true,
    import: 'default',
  },
);
/** Only the URLs Vite serves the images at: nothing is fetched until a scene loads one. */
const IMAGES = import.meta.glob<string>('../../assets/render-*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The kinds a player meets: the towers on the build bar and the enemies in waves. Art-ahead kinds join on rollout. */
const IN_PLAY: ReadonlySet<string> = new Set<SpriteKind>([...BUILD_KINDS, ...PLAYABLE_KINDS]);

function toRender(path: string, meta: RenderMeta): AnyRender {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const faction = meta.id.slice(0, meta.id.indexOf('-')) as Faction;
  const base: RenderBase = {
    id: meta.id,
    kind: meta.kind as SpriteKind,
    faction,
    pxPerTile: meta.pxPerTile,
    canvasPx: meta.canvasPx,
    pivot: meta.pivot ?? { x: meta.canvasPx / 2, y: meta.canvasPx / 2 },
  };
  const url = (suffix: string): string | undefined => IMAGES[`${dir}/${meta.id}${suffix}.png`];
  const hullUrl = url('-hull');
  const turretUrl = url('-turret');
  if (hullUrl !== undefined && turretUrl !== undefined) {
    return {
      ...base,
      hullKey: `render-${meta.id}-hull`,
      hullUrl,
      turretKey: `render-${meta.id}-turret`,
      turretUrl,
      muzzles: MUZZLES[meta.id] ?? [],
    };
  }
  const imageUrl = url('');
  if (imageUrl === undefined) throw new Error(`${path} has no image next to it`);
  return { ...base, imageKey: `render-${meta.id}`, imageUrl };
}

/** Every in-play kind's render for every Faction. */
export const ALL_RENDERS: readonly AnyRender[] = Object.entries(METAS)
  .filter(([, meta]) => IN_PLAY.has(meta.kind))
  .map(([path, meta]) => toRender(path, meta));

/** `kind`'s render in `faction`'s set, or null when the kind isn't in play (it keeps its Kenney frame or shape). */
export function renderFor(kind: SpriteKind, faction: Faction): AnyRender | null {
  return ALL_RENDERS.find((r) => r.kind === kind && r.faction === faction) ?? null;
}

/** The Faction whose model `kind` is drawn as on `map`: the defender builds the towers, the attacker sends the enemies. */
export function factionFor(kind: SpriteKind, map: { readonly attacker: Faction; readonly defender: Faction }): Faction {
  return kind in TOWER_STATS ? map.defender : map.attacker;
}

/** The texture keys `render` is drawn with: hull then turret, or its one image. */
export function renderKeys(render: AnyRender): string[] {
  return isTurretRender(render) ? [render.hullKey, render.turretKey] : [render.imageKey];
}

/**
 * The render `kind` is drawn with on `map` (the battlefield, the build bar and the enemy card), or null for its Kenney
 * frame or shape: the kind isn't in play, or `loaded` says one of its textures failed to load (ADR-0009).
 */
export function drawnRender(
  kind: SpriteKind,
  map: { readonly attacker: Faction; readonly defender: Faction },
  loaded: (key: string) => boolean,
): AnyRender | null {
  const render = renderFor(kind, factionFor(kind, map));
  return render !== null && renderKeys(render).every(loaded) ? render : null;
}

/** A texture to load: its key and URL. */
export interface RenderTexture {
  readonly key: string;
  readonly url: string;
}

/** The textures of `map`'s two sets (the defender's towers and the attacker's enemies), for a scene to load. */
export function renderTextures(map: { readonly attacker: Faction; readonly defender: Faction }): RenderTexture[] {
  return ALL_RENDERS.filter((r) => r.faction === factionFor(r.kind, map)).flatMap((r) =>
    isTurretRender(r)
      ? [
          { key: r.hullKey, url: r.hullUrl },
          { key: r.turretKey, url: r.turretUrl },
        ]
      : [{ key: r.imageKey, url: r.imageUrl }],
  );
}

/** Renders face north (`render-sprite.py` turns every model's front to +Y): −π/2 on the canvas. */
export const RENDER_FACING = -Math.PI / 2;
