/**
 * Colour maths for the accessibility checks (#355): how a colour looks with a colour vision deficiency, how far apart
 * two colours look, and WCAG text contrast. Colours are 0xRRGGBB numbers, as Phaser takes them.
 */

export const COLOUR_DEFICIENCIES = ['protanopia', 'deuteranopia', 'tritanopia'] as const;
export type ColourDeficiency = (typeof COLOUR_DEFICIENCIES)[number];

type Rgb = readonly [number, number, number];
type Matrix = readonly [Rgb, Rgb, Rgb];

/** Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB. */
const MACHADO: Record<ColourDeficiency, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toChannel = (linear: number): number => {
  const l = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
};

const linearRgb = (colour: number): Rgb => [
  toLinear((colour >> 16) & 0xff),
  toLinear((colour >> 8) & 0xff),
  toLinear(colour & 0xff),
];

/** `colour` as someone with `deficiency` sees it. */
export function simulate(colour: number, deficiency: ColourDeficiency): number {
  const [r, g, b] = linearRgb(colour);
  const channel = ([mr, mg, mb]: Rgb) => toChannel(mr * r + mg * g + mb * b);
  const [red, green, blue] = MACHADO[deficiency];
  return (channel(red) << 16) | (channel(green) << 8) | channel(blue);
}

/** CIELAB (D65) of a colour. */
function lab(colour: number): Rgb {
  const [r, g, b] = linearRgb(colour);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How different two colours look: CIE76 ΔE in CIELAB. About 2 is just noticeable; 20 is plainly different. */
export function deltaE(a: number, b: number): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** WCAG 2 relative luminance. */
const luminance = (colour: number): number => {
  const [r, g, b] = linearRgb(colour);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2 contrast ratio of two colours, 1 to 21, whichever is lighter. */
export function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
