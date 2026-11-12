// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type Game } from '../sim/game';
import type { MapData } from '../sim/map';
import { damageReport } from '../sim/report';
import { mountEndScreen, type EndScreenOptions } from './endScreen';

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
const newGame = (lives = 20, money = 100): Game =>
  createGame({
    map: SMALL,
    money,
    lives,
    waves: Array.from({ length: 3 }, () => ({
      groups: [{ kind: 'infantry' as const, count: 1, spacingMs: 100, delayMs: 0 }],
    })),
  });

/** Starts the next wave and lets its one Infantry leak, which clears the wave (or loses the game). */
const playWave = (game: Game) => {
  game.callNextWave();
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
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    expect(root.hidden).toBe(true);
    game.callNextWave();
    end.update();
    expect(game.state.phase).toBe('wave');
    expect(root.hidden).toBe(true);
  });

  it.each([
    ['normal', 'Difficulty: Normal'],
    ['hard', 'Difficulty: Hard'],
  ] as const)('says the difficulty on %s (#465)', (difficulty, text) => {
    const game = createGame({
      map: SMALL,
      money: 100,
      lives: 1,
      difficulty,
      waves: [{ groups: [{ kind: 'infantry' as const, count: 1, spacingMs: 100, delayMs: 0 }] }],
    });
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    end.update();
    expect(byTestId('difficulty')?.textContent).toBe(text);
  });

  it('after Victory shows "MISSION COMPLETE" and every wave survived', () => {
    const game = newGame();
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('victory');
    expect(root.hidden).toBe(false);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('MISSION COMPLETE');
    expect(byTestId('waves-survived')?.textContent).toBe('Waves survived 3 / 3');
  });

  it('after Defeat shows "MISSION FAILED" and the waves cleared before it', () => {
    const game = newGame(2);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('defeat');
    expect(root.hidden).toBe(false);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('MISSION FAILED');
    expect(byTestId('waves-survived')?.textContent).toBe('Waves survived 1 / 3');
  });

  it('heads the stats with an "After-action report" heading, before the waves survived', () => {
    const game = newGame(2);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    playWave(game);
    end.update();
    const aar = dialog()?.querySelector('h3');
    expect(aar?.textContent).toBe('After-action report');
    expect(aar?.nextElementSibling).toBe(byTestId('waves-survived'));
  });

  /** Plays all three waves to Victory with the End screen given `result`, and opens it. */
  const winWith = (result: NonNullable<EndScreenOptions['result']>) => {
    const game = newGame();
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {}, result });
    playWave(game);
    playWave(game);
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('victory');
  };

  it('after a Tactical mode Victory says the stars were capped (#413)', () => {
    winWith(() => ({ stars: 2, tactical: true }));
    expect(byTestId('tactical-cap')?.textContent).toBe('Tactical: max 2 stars');
  });

  it('says nothing of a cap after a timed Victory', () => {
    winWith(() => ({ stars: 3 }));
    expect(byTestId('tactical-cap')).toBeNull();
  });

  it('after Victory shows the stars earned as text, with the star glyphs hidden from screen readers', () => {
    winWith(() => ({ stars: 2 }));
    const stars = byTestId('stars');
    expect(stars?.textContent).toBe('★★☆ 2 of 3 stars');
    expect(stars?.querySelector('[aria-hidden="true"]')?.textContent).toBe('★★☆');
    expect(byTestId('unlocked')).toBeNull();
  });

  it('after a Victory that unlocked the next map, says which one', () => {
    winWith(() => ({ stars: 3, unlockedMap: 'Desert Pass' }));
    expect(byTestId('stars')?.textContent).toBe('★★★ 3 of 3 stars');
    expect(byTestId('unlocked')?.textContent).toBe('New map unlocked: Desert Pass');
  });

  it('after Defeat shows no stars and no unlock', () => {
    const game = newGame(1);
    const result = vi.fn(() => ({ stars: 1 as const, unlockedMap: 'Desert Pass' }));
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {}, result });
    playWave(game);
    end.update();
    expect(game.state.phase).toBe('defeat');
    expect(byTestId('stars')).toBeNull();
    expect(byTestId('unlocked')).toBeNull();
  });

  it('is a modal dialog labelled by its heading, and focuses Restart when it opens', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    end.update();
    const labelId = dialog()?.getAttribute('aria-labelledby');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(labelId && document.getElementById(labelId)?.textContent).toBe('MISSION FAILED');
    expect(restart()?.textContent).toBe('Restart');
    expect(document.activeElement).toBe(restart());
  });

  it('focuses Restart without scrolling the dialog', () => {
    const game = newGame(1);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    end.update();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('clicking Restart calls onRestart once', () => {
    const game = newGame(1);
    let restarts = 0;
    const end = mountEndScreen(root, game, { onRestart: () => restarts++, onLevelSelect: () => {} });
    playWave(game);
    end.update();
    restart()!.click();
    expect(restarts).toBe(1);
  });

  it('clicking Operations calls onLevelSelect once, and the button follows Restart', () => {
    const game = newGame(1);
    let picks = 0;
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => picks++ });
    playWave(game);
    end.update();
    const button = root.querySelector<HTMLButtonElement>('button[data-testid="level-select"]')!;
    expect(button.textContent).toBe('Operations');
    expect(restart()!.nextElementSibling).toBe(button);
    button.click();
    expect(picks).toBe(1);
    end.destroy();
    button.click();
    expect(picks).toBe(1);
  });

  it("update() doesn't write to the DOM once the overlay is open", () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
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
    const end = mountEndScreen(root, game, { onRestart: () => restarts++, onLevelSelect: () => {} });
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
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
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
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    game.placeTower('rifleNest', { col: 2, row: 2 });
    const second = game.placeTower('rifleNest', { col: 4, row: 2 });
    game.callNextWave();
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

  /** The By tower type table's rows (hidden ones too) as cell texts, each with its kind and whether it's hidden. */
  const typeTable = () => table('By tower type')!;
  const toggle = (name: string) =>
    [...typeTable().querySelectorAll<HTMLButtonElement>('th button')].find((b) => b.textContent === name)!;
  const visibleRows = () =>
    [...typeTable().querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .filter((tr) => !tr.closest('[hidden]'))
      .map((tr) => [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent));
  const figureCells = (row: { damage: number; kills: number; dps: number }) => [
    String(Math.round(row.damage)),
    String(row.kills),
    row.dps.toFixed(1),
  ];

  it('has no separate By tower table (#302)', () => {
    played();
    expect(table('By tower')).toBeUndefined();
  });

  it('lists each tower type with its tower count, damage, kills and DPS', () => {
    const game = played();
    expect(headers('By tower type')).toEqual(['Type', 'Towers', 'Damage', 'Kills', 'DPS']);
    const [kind] = damageReport(game.state.stats).kinds;
    expect(kind!.damage).toBeGreaterThan(0);
    expect(visibleRows()).toEqual([['Rifle Nest', '2', ...figureCells(kind!)]]);
  });

  it("a type's towers are collapsed by default, its toggle pointing at them", () => {
    played();
    const button = toggle('Rifle Nest');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const controlled = document.getElementById(button.getAttribute('aria-controls')!);
    expect(controlled?.hidden).toBe(true);
    expect(controlled?.querySelectorAll('tr')).toHaveLength(2);
  });

  it('expanding a type lists its towers underneath, with tile, damage, kills and DPS, sold ones marked', () => {
    const game = played();
    const { kinds, towers } = damageReport(game.state.stats);
    const [first, second] = towers;
    toggle('Rifle Nest').click();
    expect(toggle('Rifle Nest').getAttribute('aria-expanded')).toBe('true');
    expect(visibleRows()).toEqual([
      ['Rifle Nest', '2', ...figureCells(kinds[0]!)],
      ['Rifle Nest', 'Tile 2, 2', ...figureCells(first!)],
      ['Rifle Nest (sold)', 'Tile 4, 2', ...figureCells(second!)],
    ]);
  });

  it('collapsing a type hides its towers again', () => {
    played();
    toggle('Rifle Nest').click();
    toggle('Rifle Nest').click();
    expect(toggle('Rifle Nest').getAttribute('aria-expanded')).toBe('false');
    expect(visibleRows()).toHaveLength(1);
  });

  it("with two types, each type's towers sit under their own type, in the build bar's order", () => {
    const game = newGame(20, 300);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    game.placeTower('aaGun', { col: 2, row: 2 });
    game.placeTower('rifleNest', { col: 4, row: 2 });
    game.placeTower('aaGun', { col: 1, row: 2 });
    playWave(game);
    playWave(game);
    playWave(game);
    end.update();
    const { kinds, towers } = damageReport(game.state.stats);
    const [aa1, rifle, aa2] = towers;
    expect(kinds.map((k) => k.kind)).toEqual(['rifleNest', 'aaGun']);
    expect(visibleRows().map((r) => r[0])).toEqual(['Rifle Nest', 'AA Gun']);
    toggle('AA Gun').click();
    expect(visibleRows()).toEqual([
      ['Rifle Nest', '1', ...figureCells(kinds[0]!)],
      ['AA Gun', '2', ...figureCells(kinds[1]!)],
      ['AA Gun', 'Tile 2, 2', ...figureCells(aa1!)],
      ['AA Gun', 'Tile 1, 2', ...figureCells(aa2!)],
    ]);
    toggle('Rifle Nest').click();
    expect(visibleRows()[1]).toEqual(['Rifle Nest', 'Tile 4, 2', ...figureCells(rifle!)]);
  });

  it('has a row per wave, with a total row', () => {
    const game = played();
    const report = damageReport(game.state.stats);
    expect(headers('By wave')).toEqual(['Wave', 'Time', 'Damage', 'Kills', 'DPS']);
    expect(rows('By wave')).toEqual(
      report.waves.map((w) => [
        String(w.waveNumber),
        `${(w.elapsedMs / 1000).toFixed(1)} s`,
        String(Math.round(w.damage)),
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
        String(Math.round(total.damage)),
        String(total.kills),
        total.dps.toFixed(1),
      ],
    ]);
  });

  it('shows Damage as a whole number in every table, DPS keeping one decimal', () => {
    const game = played();
    const fractional = 1234.56;
    const stats = game.state.stats;
    const towerId = Number(Object.keys(stats.placed)[0]);
    const fake = {
      ...stats,
      total: { damage: fractional, kills: 1 },
      towers: { [towerId]: { total: { damage: fractional, kills: 1 }, wave: { damage: 0, kills: 0 } } },
      waves: stats.waves.map((w) => ({ ...w, damage: fractional })),
    };
    document.body.innerHTML = '<div id="end-screen"></div>';
    root = document.getElementById('end-screen')!;
    const end = mountEndScreen(root, { ...game, state: { ...game.state, stats: fake } } as unknown as Game, {
      onRestart: () => {},
      onLevelSelect: () => {},
    });
    end.update();
    const damageCells = (caption: string, section = 'tbody') =>
      [...table(caption)!.querySelectorAll(`${section} tr`)].map((tr) => tr.querySelectorAll('td, th')[2]!.textContent);
    // The type row, then its tower rows.
    expect(damageCells('By tower type')).toEqual(['1235', '1235', '0']);
    expect(damageCells('By wave')).toEqual(['1235', '1235', '1235']);
    expect(damageCells('By wave', 'tfoot')).toEqual(['1235']);
    expect(rows('By tower type')[1]![4]).toMatch(/^\d+\.\d$/);
  });

  it('says so when no tower was placed', () => {
    const game = newGame(1);
    const end = mountEndScreen(root, game, { onRestart: () => {}, onLevelSelect: () => {} });
    playWave(game);
    end.update();
    expect(byTestId('no-towers')?.textContent).toBe('No towers were placed.');
    expect(table('By tower')).toBeUndefined();
    expect(table('By tower type')).toBeUndefined();
    expect(rows('By wave')).toHaveLength(1);
  });
});
