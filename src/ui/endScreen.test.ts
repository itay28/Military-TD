// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, type Game } from '../sim/game';
import type { MapData } from '../sim/map';
import { mountEndScreen } from './endScreen';

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

// Three one-Infantry waves; nobody shoots, so each wave clears when its Infantry leaks.
const newGame = (lives = 20): Game =>
  createGame({
    map: SMALL,
    money: 100,
    lives,
    waves: Array.from({ length: 3 }, () => ({ kind: 'infantry' as const, count: 1, spacingMs: 100 })),
  });

/** Starts the next wave and lets its one Infantry leak, which clears the wave (or loses the game). */
const playWave = (game: Game) => {
  game.startWave();
  game.tick(LEAK_MS);
};

let root: HTMLElement;
const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');
const restart = () => root.querySelector<HTMLButtonElement>('button[data-testid="restart"]');

beforeEach(() => {
  document.body.innerHTML = '<div id="end-screen"></div>';
  root = document.getElementById('end-screen')!;
});

describe('End screen', () => {
  it('is hidden in the Build and Wave phases', () => {
    const game = newGame();
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    expect(root.hidden).toBe(true);
    game.startWave();
    end.update();
    expect(game.state.phase).toBe('wave');
    expect(root.hidden).toBe(true);
  });

  it('after Victory shows "Victory" and every wave survived', () => {
    const game = newGame();
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('victory');
    expect(root.hidden).toBe(false);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Victory');
    expect(dialog()?.querySelector('[data-testid="waves-survived"]')?.textContent).toBe('Waves survived 3 / 3');
  });

  it('after Defeat shows "Defeat" and the waves cleared before it', () => {
    const game = newGame(2);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('defeat');
    expect(root.hidden).toBe(false);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Defeat');
    expect(dialog()?.querySelector('[data-testid="waves-survived"]')?.textContent).toBe('Waves survived 1 / 3');
  });

  it('is a modal dialog labelled by its heading, and focuses Restart when it opens', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.update();
    const labelId = dialog()?.getAttribute('aria-labelledby');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(labelId && document.getElementById(labelId)?.textContent).toBe('Defeat');
    expect(restart()?.textContent).toBe('Restart');
    expect(document.activeElement).toBe(restart());
  });

  it('clicking Restart calls onRestart once', () => {
    const game = newGame(1);
    let restarts = 0;
    const end = mountEndScreen(root, game, { onRestart: () => restarts++ });
    playWave(game);
    end.update();
    restart()!.click();
    expect(restarts).toBe(1);
  });

  it("update() doesn't write to the DOM once the overlay is open", () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.update();
    const writes: string[] = [];
    new MutationObserver((records) => writes.push(...records.map((r) => r.type))).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    end.update();
    end.update();
    return Promise.resolve().then(() => expect(writes).toEqual([]));
  });

  it('destroy() empties and hides the overlay', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.update();
    end.destroy();
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
  });
});
