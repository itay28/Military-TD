import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOUR_DEFICIENCIES, contrastRatio, deltaE, simulate } from './colourVision';
import { ENEMY_STYLE, GHOST, HP_BAR, RANGE_RING, SELECTION, TOWER_STYLE } from './display';
import { MIN_CONTRAST, MIN_DELTA_E, PALETTE, UI_TEXT } from './palette';

/** The colour difference of a pair for normal vision and under each simulated deficiency. */
const visions = ['normal', ...COLOUR_DEFICIENCIES] as const;
const apart = (a: number, b: number, vision: (typeof visions)[number]) =>
  vision === 'normal' ? deltaE(a, b) : deltaE(simulate(a, vision), simulate(b, vision));

const towerOutlines = Object.values(TOWER_STYLE).map((style) => style.outline);
const enemyColours = Object.values(ENEMY_STYLE).map((style) => style.color);

const pairs: [string, number, number][] = [
  ['valid vs invalid placement', PALETTE.valid, PALETTE.invalid],
  ['full vs low HP', PALETTE.hpFull, PALETTE.hpLow],
  ...towerOutlines.flatMap((outline) =>
    enemyColours.map((enemy): [string, number, number] => [
      `friendly ${outline.toString(16)} vs enemy ${enemy.toString(16)}`,
      outline,
      enemy,
    ]),
  ),
];

describe('the meaningful colour pairs', () => {
  for (const [name, a, b] of pairs) {
    for (const vision of visions) {
      it(`${name} stay ΔE ≥ ${MIN_DELTA_E} apart with ${vision} vision`, () => {
        expect(apart(a, b, vision)).toBeGreaterThanOrEqual(MIN_DELTA_E);
      });
    }
  }
});

describe('the map draws with the palette', () => {
  it('uses it for the Ghost, HP bar, range ring and selection', () => {
    expect([GHOST.placeable, GHOST.blocked]).toEqual([PALETTE.valid, PALETTE.invalid]);
    expect([HP_BAR.fill, HP_BAR.low]).toEqual([PALETTE.hpFull, PALETTE.hpLow]);
    expect(RANGE_RING.color).toBe(PALETTE.rangeRing);
    expect(SELECTION.color).toBe(PALETTE.selection);
  });
});

describe('UI text', () => {
  const html = readFileSync('index.html', 'utf8').toLowerCase();

  for (const { use, text, background } of UI_TEXT) {
    it(`${use} (${text} on ${background}) meets WCAG AA ${MIN_CONTRAST}:1`, () => {
      expect(contrastRatio(parseInt(text.slice(1), 16), parseInt(background.slice(1), 16))).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    });

    it(`${use} uses colours that index.html has`, () => {
      expect(html).toContain(text);
      expect(html).toContain(background);
    });
  }
});
