import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FLOATING_TEXT,
  ENEMY_NAMES,
  ENEMY_WEAKNESS,
  PLACEMENT_REFUSAL_TEXT,
  TERMS,
  TILE_PX,
  TOWER_NAMES,
  TOWER_ROLES,
  UPGRADE_REFUSAL_TEXT,
  contactBanner,
  formatFunds,
  hqLevel,
  lockedLine,
} from './display';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { GRID_COLS, GRID_ROWS } from './grid';
import { FONT_STACK } from './theme';
import { TOWER_STATS, type TowerKind } from './towers';

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

describe('names and role lines', () => {
  it.each(Object.keys(TOWER_STATS) as TowerKind[])('tower %s has a name and a role line', (kind) => {
    expect(TOWER_NAMES[kind]?.trim()).toBeTruthy();
    expect(TOWER_ROLES[kind]?.trim()).toBeTruthy();
  });

  it.each(Object.keys(ENEMY_STATS) as EnemyKind[])('enemy %s has a name and a line on what hurts it', (kind) => {
    expect(ENEMY_NAMES[kind]?.trim()).toBeTruthy();
    expect(ENEMY_WEAKNESS[kind]?.trim()).toBeTruthy();
  });
});
