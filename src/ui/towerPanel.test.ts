// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { TOWER_STATS } from '../data/towers';
import { createGame, type GameState } from '../sim/game';
import type { MapData } from '../sim/map';
import { emptyStats, type CombatStats } from '../sim/stats';
import type { Tower } from '../sim/towers';
import { mountTowerPanel, type TowerPanelGame } from './towerPanel';

const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 5, row: 1 },
  ],
};

const rifleNest = (id: number): Tower => ({
  ...TOWER_STATS.rifleNest,
  id,
  kind: 'rifleNest',
  tile: { col: id, row: 3 },
  cooldownMs: 0,
});

// Tower 1 has dealt 70 damage and 2 kills in all, 35 of it this wave, 10 s in.
const PLAYED: CombatStats = {
  total: { damage: 70, kills: 2 },
  wave: { damage: 35, kills: 1, elapsedMs: 10_000 },
  towers: { 1: { total: { damage: 70, kills: 2 }, wave: { damage: 35, kills: 1 } } },
};

/** A Game whose towers and stats the test sets directly. */
const fakeGame = (towers: Tower[], stats: CombatStats = emptyStats()) => {
  const base = createGame({ map: SMALL, money: 100, lives: 20, waves: [] }).state;
  const game: { state: GameState } = { state: { ...base, towers, stats } };
  return game satisfies TowerPanelGame;
};

let root: HTMLElement;
const value = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.textContent;
const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]')!;
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

beforeEach(() => {
  document.body.innerHTML = '<div id="tower-panel"></div>';
  root = document.getElementById('tower-panel')!;
});

describe('Tower panel', () => {
  it('is hidden until a tower is selected', () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)]));
    expect(root.hidden).toBe(true);
    expect(panel.selectedId).toBeUndefined();
  });

  it("shows the selected tower's stats and figures, in a dialog labelled by its name", () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)], PLAYED));
    panel.select(1);
    expect(root.hidden).toBe(false);
    expect(panel.selectedId).toBe(1);
    expect(dialog().getAttribute('aria-labelledby')).toBe(root.querySelector('h2')?.id);
    expect(root.querySelector('h2')?.textContent).toBe('Rifle Nest');
    expect(value('tower-level')).toBe('Level 1');
    expect(value('tower-damage')).toBe('10');
    expect(value('tower-fire-rate')).toBe('2/s');
    expect(value('tower-range')).toBe('2.5 tiles');
    expect(value('tower-targets')).toBe('Ground, Air');
    expect(value('tower-wave-dps')).toBe('3.5');
    expect(value('tower-total-damage')).toBe('70');
    expect(value('tower-kills')).toBe('2');
  });

  it("shows 0 for a tower that hasn't hit anything yet", () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1), rifleNest(2)], PLAYED));
    panel.select(2);
    expect(value('tower-wave-dps')).toBe('0.0');
    expect(value('tower-total-damage')).toBe('0');
    expect(value('tower-kills')).toBe('0');
  });

  it("updates when the tower's figures change", () => {
    const game = fakeGame([rifleNest(1)]);
    const panel = mountTowerPanel(root, game);
    panel.select(1);
    expect(value('tower-total-damage')).toBe('0');
    game.state = { ...game.state, stats: PLAYED };
    panel.update();
    expect(value('tower-total-damage')).toBe('70');
    expect(value('tower-wave-dps')).toBe('3.5');
  });

  it("update() doesn't rewrite text that hasn't changed", () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)], PLAYED));
    panel.select(1);
    const writes: string[] = [];
    new MutationObserver((records) => writes.push(...records.map((r) => r.type))).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    panel.update();
    panel.update();
    return Promise.resolve().then(() => expect(writes).toEqual([]));
  });

  it('the close button deselects and hides it', () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)]));
    panel.select(1);
    root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(panel.selectedId).toBeUndefined();
    expect(root.hidden).toBe(true);
  });

  it('Escape deselects and hides it', () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)]));
    panel.select(1);
    pressEscape();
    expect(panel.selectedId).toBeUndefined();
    expect(root.hidden).toBe(true);
  });

  it('hides and deselects on the next update once the tower is gone', () => {
    const game = fakeGame([rifleNest(1)]);
    const panel = mountTowerPanel(root, game);
    panel.select(1);
    game.state = { ...game.state, towers: [] };
    panel.update();
    expect(panel.selectedId).toBeUndefined();
    expect(root.hidden).toBe(true);
  });

  it('selecting another tower shows that one', () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1), rifleNest(2)], PLAYED));
    panel.select(1);
    panel.select(2);
    expect(panel.selectedId).toBe(2);
    expect(value('tower-total-damage')).toBe('0');
  });

  it('destroy() empties and hides it, and removes its listeners', () => {
    const panel = mountTowerPanel(root, fakeGame([rifleNest(1)]));
    panel.select(1);
    const close = root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    panel.destroy();
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
    // Neither the old button nor Escape reaches the destroyed panel.
    panel.select(1);
    close.click();
    pressEscape();
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
  });
});
