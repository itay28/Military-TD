/**
 * The first map on the Level select. Written out because `src/data/maps` loads its `.tmj` through Vite (`?raw`), which
 * Playwright's loader can't import; `src/data/maps.test.ts` checks this still matches the registry.
 */
export const FIRST_MAP = { id: 'mvp', name: 'Training Ground' } as const;

/** The second map on the Level select, written out for the same reason; `src/data/maps.test.ts` checks it too. */
export const SECOND_MAP = { id: 'switchback', name: 'Switchback' } as const;

/** The third and fourth maps, for the same reason. */
export const THIRD_MAP = { id: 'serpentine', name: 'Serpentine' } as const;
export const FOURTH_MAP = { id: 'hairpin', name: 'Hairpin' } as const;
