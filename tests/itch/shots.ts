/**
 * The itch.io page kit's image files in `docs/itch/` (#374): what `npm run itch:shots` writes and
 * `tests/itch-kit.test.ts` checks. Map ids and names are written out, as in `tests/e2e/firstMap.ts`.
 */

/** Where the kit lives. */
export const KIT_DIR = 'docs/itch';

/** The maps the page shows, in Level select order. */
export const KIT_MAPS = [
  { id: 'mvp', name: 'Training Ground' },
  { id: 'switchback', name: 'Switchback' },
  { id: 'serpentine', name: 'Serpentine' },
  { id: 'hairpin', name: 'Hairpin' },
] as const;

/** The screenshot sizes itch shows well: 720p and 1080p. */
export const SHOT_SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

/** One file of the kit: its name in `KIT_DIR` and its size in pixels. */
export interface KitFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

/** What a screenshot shows: each map mid-wave, the Level select, the End screen. */
export const SHOT_SUBJECTS = [...KIT_MAPS.map(({ id }) => `map-${id}`), 'level-select', 'end-screen'] as const;

/** Every screenshot: each subject at each size, as `<subject>-<width>x<height>.png`. */
export const SCREENSHOTS: readonly KitFile[] = SHOT_SUBJECTS.flatMap((subject) =>
  SHOT_SIZES.map(({ width, height }) => ({ file: `${subject}-${width}x${height}.png`, width, height })),
);

/** The animated GIF of a wave being fought; under `GIF_MAX_BYTES`. */
export const GIF: KitFile = { file: 'wave.gif', width: 640, height: 360 };
export const GIF_MAX_BYTES = 3 * 1024 * 1024;

/** itch's cover image size. */
export const COVER: KitFile = { file: 'cover.png', width: 630, height: 500 };

export const KIT_FILES: readonly KitFile[] = [...SCREENSHOTS, GIF, COVER];
