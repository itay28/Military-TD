/**
 * Every colour that carries meaning, in one place (#355). Each one also has a cue that isn't colour (a cross, a
 * length, a shape), and `palette.test.ts` checks that the pairs that must be told apart stay apart for protanopia,
 * deuteranopia and tritanopia. There's no palette setting: this one works for everyone.
 */

/** Smallest CIE76 ΔE between the two colours of a meaningful pair, with normal vision and each simulated deficiency. */
export const MIN_DELTA_E = 20;

/** WCAG AA contrast for normal-size text. */
export const MIN_CONTRAST = 4.5;

/** Map colours (0xRRGGBB, for Phaser). */
export const PALETTE = {
  /** A Ghost where placement would succeed. */
  valid: 0x6fcf4f, // green
  /** A Ghost where it would be refused, which also gets a cross. A raspberry red: plain red merges with the green for deuteranopia. */
  invalid: 0xd03a7a,
  /** An HP bar above the low share. The bar's length is the main cue. */
  hpFull: 0x6fcf4f,
  /** An HP bar at or below the low share. */
  hpLow: 0xd03a7a,
  /** A tower's range ring. */
  rangeRing: 0xffffff,
  /** The brackets around the selected tower, the gold the UI marks a pressed or focused control with. */
  selection: 0xf0c95a,
} as const;

/**
 * The text colours of `index.html` on their backgrounds (CSS hex, the same strings as there), each at least
 * `MIN_CONTRAST`. Disabled controls are left out, as WCAG allows for inactive components.
 */
export const UI_TEXT = [
  { use: 'HUD and screen text', text: '#e4e0c8', background: '#1b1e16' },
  { use: 'HUD banner, titles and stars', text: '#f0c95a', background: '#1b1e16' },
  { use: 'Dialog titles', text: '#f0c95a', background: '#232820' },
  { use: 'Button text', text: '#1b1e16', background: '#c2a46b' },
  { use: 'Outlined toggle text', text: '#c2a46b', background: '#1b1e16' },
  { use: 'Build bar button text', text: '#e4e0c8', background: '#232820' },
  { use: 'Pressed build bar button text', text: '#e4e0c8', background: '#343a29' },
  { use: "Build bar text for a tower you can't afford", text: '#959179', background: '#232820' },
  { use: 'Tower panel labels and DPS meter headings', text: '#a2a58f', background: '#232820' },
  { use: 'Sell button text', text: '#e8d9b0', background: '#232820' },
  { use: 'Locked map text', text: '#a2a58f', background: '#1b1e16' },
  { use: 'Credits links', text: '#9cc8e8', background: '#1b1e16' },
  { use: 'Version text', text: '#959179', background: '#1b1e16' },
] as const;
