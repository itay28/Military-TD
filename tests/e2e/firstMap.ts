/**
 * The first map on the Level select. Written out because `src/data/maps` loads its `.tmj` through Vite (`?raw`), which
 * Playwright's loader can't import; `src/data/maps.test.ts` checks this still matches the registry.
 */
export const FIRST_MAP = { id: 'mvp', name: 'Training Ground' } as const;
