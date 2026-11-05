import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FLOATING_TEXT,
  PLACEMENT_REFUSAL_TEXT,
  TERMS,
  TILE_PX,
  UPGRADE_REFUSAL_TEXT,
  contactBanner,
  formatFunds,
  hqLevel,
  lockedLine,
} from './display';
import { GRID_COLS, GRID_ROWS } from './grid';
import { FONT_STACK } from './theme';

describe('display', () => {
  it('canvas is 768×480 from a 16×10 grid of 48 px tiles', () => {
    expect([GRID_COLS, GRID_ROWS, TILE_PX]).toEqual([16, 10, 48]);
    expect([CANVAS_WIDTH, CANVAS_HEIGHT]).toEqual([768, 480]);
  });
});

describe('Phaser text (#399)', () => {
  it('floats refusals in the same monospace face as the HUD', () => {
    expect(FLOATING_TEXT.style.fontFamily).toBe(FONT_STACK.mono);
  });
});

describe('display names (ADR-0010)', () => {
  it('names the player-facing terms in one place', () => {
    expect(TERMS).toEqual({
      money: 'Funds',
      lives: 'HQ',
      startWave: 'Start wave',
      play: 'Deploy',
      levelSelect: 'Operations',
      victory: 'MISSION COMPLETE',
      defeat: 'MISSION FAILED',
      report: 'After-action report',
    });
  });

  it('shows Funds as dollars', () => {
    expect(formatFunds(100)).toBe('$100');
    expect(formatFunds(0)).toBe('$0');
  });

  it('announces a wave start as Contact', () => {
    expect(contactBanner(3)).toBe('CONTACT — WAVE 3');
  });

  it('says what unlocks a locked map, with no emoji', () => {
    expect(lockedLine('Training Ground')).toBe('Locked: complete Training Ground');
    expect(lockedLine(undefined)).toBe('Locked: complete the map before');
  });

  it('rates the HQ by the share of Lives left', () => {
    expect(hqLevel(20, 20)).toBe('ok');
    expect(hqLevel(11, 20)).toBe('ok');
    expect(hqLevel(10, 20)).toBe('low');
    expect(hqLevel(6, 20)).toBe('low');
    expect(hqLevel(5, 20)).toBe('critical');
    expect(hqLevel(0, 20)).toBe('critical');
  });

  it('no player-facing text uses an emoji', () => {
    const texts = [
      ...Object.values(TERMS),
      ...Object.values(PLACEMENT_REFUSAL_TEXT),
      ...Object.values(UPGRADE_REFUSAL_TEXT),
      lockedLine('X'),
      contactBanner(1),
    ];
    for (const text of texts) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('refusals say Funds, not Money', () => {
    expect(PLACEMENT_REFUSAL_TEXT.insufficientMoney).toBe('Not enough funds');
    expect(UPGRADE_REFUSAL_TEXT.insufficientMoney).toBe('Not enough funds');
  });
});
