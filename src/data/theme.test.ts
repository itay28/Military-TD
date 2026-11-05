import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA, CONTRAST_PAIRS, contrastRatio, FONT_STACK, PALETTE } from './theme';

const html = readFileSync('index.html', 'utf8');
const style = /<style>([\s\S]*)<\/style>/.exec(html)?.[1] ?? '';
const root = /:root\s*\{([^}]*)\}/.exec(style)?.[1] ?? '';
/** Everything after the `:root` block, without comments: the rules that use the tokens. */
const rules = style.slice(style.indexOf(root) + root.length).replace(/\/\*[\s\S]*?\*\//g, '');
const fontsCss = readFileSync('src/ui/fonts.css', 'utf8');

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for equal colours, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#c2a46b', '#c2a46b')).toBe(1);
  });
});

describe('palette', () => {
  it.each(CONTRAST_PAIRS)('$fg on $bg ($use) meets WCAG AA', ({ fg, bg, level }) => {
    expect(contrastRatio(PALETTE[fg], PALETTE[bg])).toBeGreaterThanOrEqual(AA[level]);
  });

  it('declares every palette token in index.html :root with the same value', () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(root, `--${name}`).toMatch(new RegExp(`--${name}:\\s*${hex};`, 'i'));
    }
  });

  it('declares the font stacks in index.html :root', () => {
    expect(root).toContain(`--font-stencil: ${FONT_STACK.stencil};`);
    expect(root).toContain(`--font-mono: ${FONT_STACK.mono};`);
  });

  it('uses tokens in the rules, with no raw colours', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\brgba?\(/);
  });

  it('names a font only through the tokens', () => {
    expect(rules).not.toMatch(/\b(monospace|sans-serif|serif)\b/);
  });

  it('sizes text in rem, so the text-size setting (#354) scales it from one root size', () => {
    expect(rules).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(rules).not.toMatch(/font:[^;]*\b[\d.]+px/);
  });
});

describe('fonts.css', () => {
  it('self-hosts each face, unmodified, from assets/ with font-display: swap', () => {
    for (const file of ['AllertaStencil-Regular', 'IBMPlexMono-Regular', 'IBMPlexMono-Bold']) {
      expect(fontsCss).toMatch(new RegExp(`url\\('[./]*assets/[a-z-]+/${file}\\.ttf'\\)`));
    }
    expect(fontsCss.match(/font-display: swap;/g)).toHaveLength(3);
    expect(fontsCss).not.toMatch(/googleapis|gstatic/);
  });

  it('declares a metric-matched local fallback for each face in the stacks', () => {
    for (const name of ['Allerta Stencil Fallback', 'IBM Plex Mono Fallback']) {
      const face = new RegExp(`font-family: '${name}';[^}]*size-adjust:[^}]*ascent-override:[^}]*descent-override`);
      expect(fontsCss).toMatch(face);
    }
  });
});
