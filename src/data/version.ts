/** The game's version, from package.json. Vite injects it at build time (vite.config.ts `define`). */
export const GAME_VERSION: string = __APP_VERSION__;

/** How the version is shown in the game: `v0.3.1`. Bug reports should include it (ADR-0004). */
export function versionLabel(version: string): string {
  return `v${version}`;
}
