// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type Game } from '../sim/game';
import type { MapData } from '../sim/map';
import { damageReport } from '../sim/report';
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
    waves: Array.from({ length: 3 }, () => ({
      groups: [{ kind: 'infantry' as const, count: 1, spacingMs: 100, delayMs: 0 }],
    })),
  });

/** Starts the next wave and lets its one Infantry leak, which clears the wave (or loses the game). */
const playWave = (game: Game) => {
  game.startWave();
  game.tick(LEAK_MS);
};

let root: HTMLElement;
const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
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
    expect(byTestId('waves-survived')?.textContent).toBe('Waves survived 3 / 3');
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
    expect(byTestId('waves-survived')?.textContent).toBe('Waves survived 1 / 3');
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

  it('focuses Restart without scrolling the dialog', () => {
    const game = newGame(1);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.update();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
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

  it('destroy() empties and hides the overlay, and a later click on the old button does nothing', () => {
    const game = newGame(1);
    let restarts = 0;
    const end = mountEndScreen(root, game, { onRestart: () => restarts++ });
    playWave(game);
    end.update();
    const oldButton = restart()!;
    end.destroy();
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
    oldButton.click();
    expect(restarts).toBe(0);
  });

  it('update() after destroy() leaves the overlay hidden', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.destroy();
    end.update();
    expect(root.hidden).toBe(true);
  });
});

describe('damage report', () => {
  /** Rifle Nest 1 beside the Path plays every wave; Rifle Nest 2 is sold during wave 1. Ends in Victory. */
  const played = () => {
    const game = newGame();
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    game.placeTower('rifleNest', { col: 2, row: 2 });
    const second = game.placeTower('rifleNest', { col: 4, row: 2 });
    game.startWave();
    if (second.ok) game.sellTower(second.towerId);
    for (let t = 0; t < LEAK_MS; t += 50) game.tick(50);
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('victory');
    return game;
  };
  const table = (caption: string) =>
    [...root.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === caption);
  const headers = (caption: string) => [...table(caption)!.querySelectorAll('thead th')].map((th) => th.textContent);
  const rows = (caption: string, section = 'tbody') =>
    [...table(caption)!.querySelectorAll(`${section} tr`)].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent),
    );

  it('lists every tower with its kind, tile, damage, kills and DPS, sold ones marked', () => {
    const game = played();
    expect(headers('By tower')).toEqual(['Tower', 'Tile', 'Damage', 'Kills', 'DPS']);
    const [first, second] = damageReport(game.state.stats).towers;
    expect(first!.damage).toBeGreaterThan(0);
    expect(rows('By tower')).toEqual([
      ['Rifle Nest', '2, 2', String(first!.damage), String(first!.kills), first!.dps.toFixed(1)],
      ['Rifle Nest (sold)', '4, 2', String(second!.damage), String(second!.kills), second!.dps.toFixed(1)],
    ]);
  });

  it('sums each tower type', () => {
    const game = played();
    expect(headers('By tower type')).toEqual(['Type', 'Towers', 'Damage', 'Kills', 'DPS']);
    const [kind] = damageReport(game.state.stats).kinds;
    expect(rows('By tower type')).toEqual([
      ['Rifle Nest', '2', String(kind!.damage), String(kind!.kills), kind!.dps.toFixed(1)],
    ]);
  });

  it('has a row per wave, with a total row', () => {
    const game = played();
    const report = damageReport(game.state.stats);
    expect(headers('By wave')).toEqual(['Wave', 'Time', 'Damage', 'Kills', 'DPS']);
    expect(rows('By wave')).toEqual(
      report.waves.map((w) => [
        String(w.waveNumber),
        `${(w.elapsedMs / 1000).toFixed(1)} s`,
        String(w.damage),
        String(w.kills),
        w.dps.toFixed(1),
      ]),
    );
    expect(rows('By wave')).toHaveLength(3);
    const { total } = report;
    expect(rows('By wave', 'tfoot')).toEqual([
      [
        'Total',
        `${(total.elapsedMs / 1000).toFixed(1)} s`,
        String(total.damage),
        String(total.kills),
        total.dps.toFixed(1),
      ],
    ]);
  });

  it('says so when no tower was placed', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {} });
    playWave(game);
    end.update();
    expect(byTestId('no-towers')?.textContent).toBe('No towers were placed.');
    expect(table('By tower')).toBeUndefined();
    expect(rows('By wave')).toHaveLength(1);
  });
});
