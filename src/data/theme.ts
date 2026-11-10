/**
 * The military look (#399): one palette and two type faces, shared by the DOM UI and Phaser text.
 *
 * `index.html` declares each entry as a `:root` custom property (`--olive-900`, `--font-mono`, …) and every rule uses
 * them; `theme.test.ts` keeps the two in step and checks the contrast pairs below against WCAG AA.
 */

/** Grounds are olive and dark green, accents tan, readouts amber; red is kept for danger. */
export const PALETTE = {
  /** The page ground, behind the map and the menus. */
  'olive-950': '#14170f',
  'olive-900': '#1b1e16',
  /** Panels, dialogs and the HUD bar. */
  'olive-800': '#232820',
  /** A pressed or hovered control. */
  'olive-700': '#343a29',
  /** Frame lines and dividers. */
  'olive-600': '#4a4f3c',
  /** Disabled controls. */
  'olive-500': '#5e6350',
  /** Rules inside tables. */
  'green-600': '#5b6b3a',
  /** Buttons and frame corners. */
  tan: '#c2a46b',
  'tan-light': '#e8d9b0',
  /** Body text. */
  bone: '#e4e0c8',
  /** Labels and secondary text. */
  'bone-dim': '#a2a58f',
  /** Hints and the version stamp. */
  'bone-muted': '#959179',
  /** Readouts, titles and focus rings. */
  amber: '#f0c95a',
  /** Danger only: the HQ critical, a refused action. */
  danger: '#e0533d',
  /** The HQ bar at full strength. */
  ok: '#6fcf4f',
  /** Links on the Credits screen. */
  link: '#9cc8e8',
} as const;

export type PaletteToken = keyof typeof PALETTE;

/**
 * The two faces, each with its metric-matched fallback (`src/ui/fonts.css`), so text doesn't move when the font
 * file arrives. Stencil for titles and headers; monospace for readouts, labels and body text.
 */
export const FONT_STACK = {
  stencil: "'Allerta Stencil', 'Allerta Stencil Fallback', sans-serif",
  mono: "'IBM Plex Mono', 'IBM Plex Mono Fallback', monospace",
} as const;

/** WCAG AA: 4.5:1 for text, 3:1 for large text (titles) and for UI parts like frame lines and bar fills. */
export const AA = { text: 4.5, large: 3, ui: 3 } as const;

export interface ContrastPair {
  readonly fg: PaletteToken;
  readonly bg: PaletteToken;
  readonly level: keyof typeof AA;
  /** Where the pair is used. */
  readonly use: string;
}

/** Every foreground the UI puts on a ground. Disabled controls are exempt from WCAG and are left out. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...(['olive-950', 'olive-900', 'olive-800', 'olive-700'] as const).flatMap((bg) => [
    { fg: 'bone', bg, level: 'text', use: 'body text' } as const,
    { fg: 'bone-dim', bg, level: 'text', use: 'labels' } as const,
    { fg: 'amber', bg, level: 'text', use: 'readouts and titles' } as const,
    { fg: 'tan', bg, level: 'text', use: 'outlined buttons and headers' } as const,
  ]),
  { fg: 'bone-muted', bg: 'olive-950', level: 'text', use: 'the version stamp' },
  { fg: 'bone-muted', bg: 'olive-800', level: 'text', use: 'an unaffordable tower' },
  { fg: 'tan-light', bg: 'olive-800', level: 'text', use: 'the Sell button' },
  { fg: 'olive-900', bg: 'tan', level: 'text', use: 'filled buttons' },
  { fg: 'link', bg: 'olive-950', level: 'text', use: 'Credits links' },
  { fg: 'danger', bg: 'olive-800', level: 'ui', use: 'the HQ bar when critical' },
  { fg: 'amber', bg: 'olive-800', level: 'ui', use: 'the HQ bar when low, and focus rings' },
  { fg: 'ok', bg: 'olive-800', level: 'ui', use: 'the HQ bar' },
  { fg: 'tan', bg: 'olive-950', level: 'ui', use: 'frame corners' },
  { fg: 'bone-dim', bg: 'olive-800', level: 'ui', use: 'the HQ bar edge' },
];

/** `#rrggbb` to its WCAG relative luminance. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The WCAG contrast ratio of two `#rrggbb` colours, from 1 (equal) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
