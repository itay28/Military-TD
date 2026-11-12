// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEMY_NAMES, ENEMY_WEAKNESS } from '../data/display';
import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { createGame, type GameState } from '../sim/game';
import type { Enemy } from '../sim/enemies';
import type { MapData } from '../sim/map';
import { mountEnemyCard, type EnemyCardGame } from './enemyCard';

const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 5, row: 1 },
  ],
};

const enemy = (id: number, kind: EnemyKind, hp: number = ENEMY_STATS[kind].maxHp): Enemy => ({
  ...ENEMY_STATS[kind],
  id,
  kind,
  hp,
  distance: 1,
  position: { x: 1.5, y: 1.5 },
});

/** A Game whose enemies the test sets directly. */
const fakeGame = (enemies: Enemy[]) => {
  const base = createGame({ map: SMALL, money: 100, lives: 20, waves: [] }).state;
  const game: EnemyCardGame & { state: GameState } = { state: { ...base, enemies } };
  return game;
};

let root: HTMLElement;
const value = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.textContent;
const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]')!;
const pressEscape = () => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="enemy-card"></div>';
  root = document.getElementById('enemy-card')!;
});

describe('Enemy card', () => {
  it('is hidden until an enemy is shown', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    expect(root.hidden).toBe(true);
    expect(card.shownId).toBeUndefined();
  });

  it("shows the enemy's name, HP, armor, layer, speed and what hurts it, in a dialog labelled by its name", () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'tank', 200)]));
    card.pin(1);
    expect(root.hidden).toBe(false);
    expect(card.shownId).toBe(1);
    const labelId = dialog().getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe(ENEMY_NAMES.tank);
    expect(value('enemy-hp')).toBe(`200 / ${ENEMY_STATS.tank.maxHp}`);
    expect(value('enemy-armor')).toBe(String(ENEMY_STATS.tank.armor));
    expect(value('enemy-layer')).toBe('Ground');
    expect(value('enemy-speed')).toBe(`${ENEMY_STATS.tank.speed} tiles/s`);
    expect(value('enemy-weakness')).toBe(ENEMY_WEAKNESS.tank);
  });

  it('names an air enemy as Air', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'helicopter')]));
    card.pin(1);
    expect(value('enemy-layer')).toBe('Air');
  });

  it('updates HP live', () => {
    const game = fakeGame([enemy(1, 'infantry')]);
    const card = mountEnemyCard(root, game);
    card.pin(1);
    game.state = { ...game.state, enemies: [enemy(1, 'infantry', 12)] };
    card.update();
    expect(value('enemy-hp')).toBe(`12 / ${ENEMY_STATS.infantry.maxHp}`);
  });

  it('closes when the enemy dies or leaks (is no longer on the map)', () => {
    const game = fakeGame([enemy(1, 'infantry')]);
    const card = mountEnemyCard(root, game);
    card.pin(1);
    game.state = { ...game.state, enemies: [] };
    card.update();
    expect(root.hidden).toBe(true);
    expect(card.shownId).toBeUndefined();
    expect(card.pinnedId).toBeUndefined();
  });

  it('Escape closes a pinned card and is marked handled, so it does not also pause', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    card.pin(1);
    expect(pressEscape().defaultPrevented).toBe(true);
    expect(root.hidden).toBe(true);
    expect(card.pinnedId).toBeUndefined();
  });

  it('Escape with no card open is left alone', () => {
    mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it('the close button closes it', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    card.pin(1);
    root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(root.hidden).toBe(true);
    expect(card.pinnedId).toBeUndefined();
  });

  it('hovering shows an enemy until the pointer leaves it', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    card.hover(1);
    expect(card.shownId).toBe(1);
    expect(card.pinnedId).toBeUndefined();
    card.hover(undefined);
    expect(root.hidden).toBe(true);
  });

  it('a pinned enemy stays shown over a hovered one', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry'), enemy(2, 'jeep')]));
    card.pin(1);
    card.hover(2);
    expect(card.shownId).toBe(1);
    expect(value('enemy-hp')).toBe(`30 / ${ENEMY_STATS.infantry.maxHp}`);
  });

  it('runs onPin when an enemy gets pinned, not on close', () => {
    const onPin = vi.fn();
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]), { onPin });
    card.pin(1);
    card.pin(undefined);
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('does nothing after destroy()', () => {
    const card = mountEnemyCard(root, fakeGame([enemy(1, 'infantry')]));
    card.destroy();
    card.pin(1);
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
  });
});

describe('Enemy card icon (#567)', () => {
  const icon = () => root.querySelector<HTMLElement>('[data-testid="enemy-icon"]')!;

  it("shows the shown enemy's render, the same images the battlefield draws", () => {
    const iconFor = vi.fn((kind: EnemyKind) =>
      kind === 'tank'
        ? { layerUrls: ['tank-hull.png', 'tank-turret.png'], canvasPx: 200 }
        : { layerUrls: ['jeep.png'], canvasPx: 160 },
    );
    const game = fakeGame([enemy(1, 'tank'), enemy(2, 'jeep')]);
    const card = mountEnemyCard(root, game, { iconFor });
    card.pin(1);
    let layers = [...icon().querySelectorAll<HTMLElement>('.build-icon-layer')];
    expect(layers.map((l) => l.style.backgroundImage)).toEqual([
      expect.stringContaining('tank-hull.png'),
      expect.stringContaining('tank-turret.png'),
    ]);
    expect(icon().hidden).toBe(false);
    card.pin(2);
    layers = [...icon().querySelectorAll<HTMLElement>('.build-icon-layer')];
    expect(layers).toHaveLength(1);
    expect(layers[0]!.style.backgroundImage).toContain('jeep.png');
    // Built once per kind shown, not every frame.
    card.update();
    card.update();
    expect(iconFor).toHaveBeenCalledTimes(2);
  });

  it('hides the icon when the kind has no render (it failed to load)', () => {
    const game = fakeGame([enemy(1, 'tank')]);
    const card = mountEnemyCard(root, game, { iconFor: () => null });
    card.pin(1);
    expect(icon().hidden).toBe(true);
    expect(icon().childElementCount).toBe(0);
  });
});
