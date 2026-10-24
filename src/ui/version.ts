import { GAME_VERSION, versionLabel } from '../data/version';

/** Fills the corner version label (`#version` in index.html) so bug reports can name the build (ADR-0004). */
export function showVersion(el: Pick<HTMLElement, 'textContent'>): void {
  el.textContent = versionLabel(GAME_VERSION);
}
