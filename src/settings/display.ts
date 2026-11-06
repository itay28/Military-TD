import type { SettingsStore } from './settings';

/**
 * Applies the display settings to the page (#354): `--text-scale` on `root` scales every DOM font size (index.html),
 * and `data-reduced-motion` turns CSS transitions and animations off. Follows each change until the returned function
 * is called.
 */
export function applyDisplaySettings(settings: SettingsStore, root: HTMLElement): () => void {
  const apply = () => {
    const { textSize, reducedMotion } = settings.get();
    root.style.setProperty('--text-scale', String(textSize / 100));
    root.toggleAttribute('data-reduced-motion', reducedMotion);
  };
  apply();
  return settings.subscribe(apply);
}

/** Whether the system asks for less motion: the default for the reduced-motion setting. False where it can't tell. */
export function prefersReducedMotion(win: { matchMedia?: (query: string) => { readonly matches: boolean } }): boolean {
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
