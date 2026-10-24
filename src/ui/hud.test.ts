// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { WAVE_BANNER_MS } from '../data/display';
import { createGame, type Game } from '../sim/game';
import type { MapData } from '../sim/map';
import { mountHud } from './hud';

// Path 6 tiles long: an Infantry (1.5 tiles/s) leaks after 4000 ms.
const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 3, row: 1 },
    { col: 3, row: 4 },
  ],
};
const LEAK_MS = 4000;

// Two one-Infantry waves; nobody shoots, so each wave clears when its Infantry leaks.
const newGame = (lives = 20): Game =>
  createGame({
    map: SMALL,
    money: 100,
    lives,
    waves: [
      { kind: 'infantry', count: 1, spacingMs: 100 },
      { kind: 'infantry', count: 1, spacingMs: 100 },
    ],
  });

let root: HTMLElement;
const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
  root = document.getElementById('hud')!;
});

describe('HUD', () => {
  it('shows the starting Money, Lives and "Wave 0 / N"', () => {
    mountHud(root, newGame());
    expect(byTestId('hud-money')?.textContent).toBe('Money 100');
    expect(byTestId('hud-lives')?.textContent).toBe('Lives 20');
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 0 / 2');
  });

  it('Lives drop on the next update after a leak', () => {
    const game = newGame();
    const hud = mountHud(root, game);
    game.startWave();
    game.tick(LEAK_MS);
    hud.update();
    expect(byTestId('hud-lives')?.textContent).toBe('Lives 19');
  });

  it('Money drops on the next update after a tower is placed', () => {
    const game = newGame();
    const hud = mountHud(root, game);
    expect(game.placeTower('rifleNest', { col: 1, row: 0 })).toMatchObject({ ok: true });
    hud.update();
    expect(byTestId('hud-money')?.textContent).toBe('Money 50');
  });

  it('the wave counter shows the started wave', () => {
    const game = newGame();
    const hud = mountHud(root, game);
    game.startWave();
    hud.update();
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 1 / 2');
  });

  describe('Start Wave', () => {
    const button = () => root.querySelector<HTMLButtonElement>('button[data-testid="start-wave"]');

    it('is a "Start Wave" button, enabled in the Build phase', () => {
      mountHud(root, newGame());
      expect(button()?.textContent).toBe('Start Wave');
      expect(button()?.disabled).toBe(false);
    });

    it('clicking it starts the next wave', () => {
      const game = newGame();
      mountHud(root, game);
      button()!.click();
      expect(game.state.phase).toBe('wave');
      expect(game.state.waveNumber).toBe(1);
    });

    it('is disabled during a wave, and enabled again once the wave is cleared', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      button()!.click();
      hud.update();
      expect(button()?.disabled).toBe(true);
      game.tick(LEAK_MS);
      hud.update();
      expect(game.state.phase).toBe('build');
      expect(button()?.disabled).toBe(false);
    });

    it('is disabled after Victory', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      for (let i = 0; i < 2; i++) {
        game.startWave();
        game.tick(LEAK_MS);
      }
      hud.update();
      expect(game.state.phase).toBe('victory');
      expect(button()?.disabled).toBe(true);
    });

    it('is disabled after Defeat', () => {
      const game = newGame(1);
      const hud = mountHud(root, game);
      game.startWave();
      game.tick(LEAK_MS);
      hud.update();
      expect(game.state.phase).toBe('defeat');
      expect(button()?.disabled).toBe(true);
    });
  });

  describe('Wave cleared banner', () => {
    const banner = () => root.querySelector<HTMLElement>('[role="status"][data-testid="wave-banner"]');

    it('is hidden at first', () => {
      mountHud(root, newGame());
      expect(banner()?.hidden).toBe(true);
    });

    it('shows "Wave N cleared" when a wave is cleared', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      game.startWave();
      game.tick(LEAK_MS);
      hud.update();
      expect(banner()?.hidden).toBe(false);
      expect(banner()?.textContent).toBe('Wave 1 cleared');
    });

    it('hides after WAVE_BANNER_MS of sim time', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      game.startWave();
      game.tick(LEAK_MS);
      game.tick(WAVE_BANNER_MS - 1);
      hud.update();
      expect(banner()?.hidden).toBe(false);
      game.tick(1);
      hud.update();
      expect(banner()?.hidden).toBe(true);
    });

    it("doesn't stay up once the game is over", () => {
      const game = newGame();
      const hud = mountHud(root, game);
      for (let i = 0; i < 2; i++) {
        game.startWave();
        game.tick(LEAK_MS);
      }
      hud.update();
      expect(game.state.phase).toBe('victory');
      expect(banner()?.hidden).toBe(true);
    });
  });

  it("update() doesn't rewrite text that hasn't changed", () => {
    const game = newGame();
    const hud = mountHud(root, game);
    const writes: string[] = [];
    new MutationObserver((records) => writes.push(...records.map((r) => r.type))).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    hud.update();
    hud.update();
    return Promise.resolve().then(() => expect(writes).toEqual([]));
  });

  it('destroy() removes the HUD, and later game events leave it gone', () => {
    const game = newGame();
    const hud = mountHud(root, game);
    hud.destroy();
    expect(root.children).toHaveLength(0);
    game.startWave();
    game.tick(LEAK_MS);
    expect(root.children).toHaveLength(0);
    expect(root.textContent).toBe('');
  });
});
