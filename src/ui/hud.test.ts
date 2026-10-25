// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { WAVE_BANNER_MS } from '../data/display';
import { waveDps } from '../sim/stats';
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

/** Starts the next wave and lets its one Infantry leak, which clears the wave. */
const playWave = (game: Game) => {
  game.startWave();
  game.tick(LEAK_MS);
};

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
    playWave(game);
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
      playWave(game);
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('victory');
      expect(button()?.disabled).toBe(true);
    });

    it('is disabled after Defeat', () => {
      const game = newGame(1);
      const hud = mountHud(root, game);
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('defeat');
      expect(button()?.disabled).toBe(true);
    });
  });

  // The banner is a live region: it stays in place and only its text changes, so screen readers announce it.
  describe('Wave cleared banner', () => {
    const banner = () => root.querySelector<HTMLElement>('[role="status"][data-testid="wave-banner"]');

    it('is an empty, visible status region at first', () => {
      mountHud(root, newGame());
      expect(banner()?.hidden).toBe(false);
      expect(banner()?.textContent).toBe('');
    });

    it('shows "Wave N cleared" when a wave is cleared', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      playWave(game);
      hud.update();
      expect(banner()?.textContent).toBe('Wave 1 cleared');
    });

    it('empties after WAVE_BANNER_MS of sim time', () => {
      const game = newGame();
      const hud = mountHud(root, game);
      playWave(game);
      game.tick(WAVE_BANNER_MS - 1);
      hud.update();
      expect(banner()?.textContent).toBe('Wave 1 cleared');
      game.tick(1);
      hud.update();
      expect(banner()?.textContent).toBe('');
    });

    it("doesn't stay up once the game is over", () => {
      const game = newGame();
      const hud = mountHud(root, game);
      playWave(game);
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('victory');
      expect(banner()?.textContent).toBe('');
    });
  });

  describe('DPS', () => {
    const dps = () => byTestId('hud-dps')?.textContent;
    const armed = () => {
      const game = newGame();
      expect(game.placeTower('rifleNest', { col: 1, row: 0 })).toMatchObject({ ok: true });
      return game;
    };
    const rounded = (game: Game) =>
      `DPS ${Math.round(waveDps(game.state.stats.wave.damage, game.state.stats.wave.elapsedMs))}`;

    it('shows "DPS –" before any wave', () => {
      mountHud(root, armed());
      expect(dps()).toBe('DPS –');
    });

    it('shows the rounded wave DPS during a wave', () => {
      const game = armed();
      const hud = mountHud(root, game);
      game.startWave();
      for (let t = 0; t < 1500; t += 100) game.tick(100);
      hud.update();
      expect(game.state.stats.wave.damage).toBeGreaterThan(0);
      expect(dps()).toBe(rounded(game));
    });

    it("keeps the last wave's figure after waveCleared", () => {
      const game = armed();
      const hud = mountHud(root, game);
      game.startWave();
      for (let t = 0; t < LEAK_MS; t += 100) game.tick(100);
      hud.update();
      expect(game.state.phase).toBe('build');
      const figure = rounded(game);
      expect(figure).not.toBe('DPS 0');
      expect(dps()).toBe(figure);
      game.tick(5000);
      hud.update();
      expect(dps()).toBe(figure);
    });

    it("doesn't write to the DOM while the rounded value is unchanged", async () => {
      const game = armed();
      const hud = mountHud(root, game);
      game.startWave();
      for (let t = 0; t < LEAK_MS; t += 100) game.tick(100);
      hud.update();
      const writes: string[] = [];
      new MutationObserver((records) => writes.push(...records.map((r) => r.type))).observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      hud.update();
      await Promise.resolve();
      expect(writes).toEqual([]);
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
    playWave(game);
    expect(root.children).toHaveLength(0);
    expect(root.textContent).toBe('');
  });
});
