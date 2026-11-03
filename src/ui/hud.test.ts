// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { WAVE_BANNER_MS } from '../data/display';
import { createGame, type Game } from '../sim/game';
import type { MapData } from '../sim/map';
import { waveDps } from '../sim/stats';
import type { GameSpeed } from '../scenes/gameSpeed';
import { mountHud, type HudSpeed } from './hud';

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

const TIMER_MS = 10_000;
// Two one-Infantry waves, 10 s apart in timed mode; nobody shoots, so each wave clears when its Infantry leaks.
// Tactical by default: most of these tests are about one wave at a time.
const newGame = (lives = 20, tacticalMode = true): Game =>
  createGame({
    map: SMALL,
    money: 100,
    lives,
    tacticalMode,
    waves: [
      { groups: [{ kind: 'infantry', count: 1, spacingMs: 100, delayMs: 0 }], afterMs: TIMER_MS },
      { groups: [{ kind: 'infantry', count: 1, spacingMs: 100, delayMs: 0 }], afterMs: TIMER_MS },
    ],
  });
const timedGame = (lives = 20) => newGame(lives, false);

/** Starts the next wave and lets its one Infantry leak, which clears the wave. */
const playWave = (game: Game) => {
  game.callNextWave();
  game.tick(LEAK_MS);
};

/** A speed holder like the scene's: the HUD reads and sets it. */
const fakeSpeed = (initial: GameSpeed = 1): HudSpeed => {
  let speed = initial;
  return { get: () => speed, set: (next) => (speed = next) };
};

let root: HTMLElement;
const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
  root = document.getElementById('hud')!;
});

describe('HUD', () => {
  it('shows the starting Money, Lives and "Wave 0 / N"', () => {
    mountHud(root, newGame(), fakeSpeed());
    expect(byTestId('hud-money')?.textContent).toBe('Money 100');
    expect(byTestId('hud-lives')?.textContent).toBe('Lives 20');
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 0 / 2');
  });

  it('Lives drop on the next update after a leak', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    playWave(game);
    hud.update();
    expect(byTestId('hud-lives')?.textContent).toBe('Lives 19');
  });

  it('Money drops on the next update after a tower is placed', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    expect(game.placeTower('rifleNest', { col: 1, row: 0 })).toMatchObject({ ok: true });
    hud.update();
    expect(byTestId('hud-money')?.textContent).toBe('Money 50');
  });

  it('the wave counter shows the started wave', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.callNextWave();
    hud.update();
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 1 / 2');
  });

  describe('Start Wave (Tactical mode)', () => {
    const button = () => root.querySelector<HTMLButtonElement>('button[data-testid="start-wave"]');

    it('is a "Start Wave" button, enabled in the Build phase', () => {
      mountHud(root, newGame(), fakeSpeed());
      expect(button()?.textContent).toBe('Start Wave');
      expect(button()?.disabled).toBe(false);
    });

    it('clicking it starts the next wave', () => {
      const game = newGame();
      mountHud(root, game, fakeSpeed());
      button()!.click();
      expect(game.state.phase).toBe('wave');
      expect(game.state.waveNumber).toBe(1);
    });

    it('is disabled during a wave, and enabled again once the wave is cleared', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
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
      const hud = mountHud(root, game, fakeSpeed());
      playWave(game);
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('victory');
      expect(button()?.disabled).toBe(true);
    });

    it('is disabled after Defeat', () => {
      const game = newGame(1);
      const hud = mountHud(root, game, fakeSpeed());
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('defeat');
      expect(button()?.disabled).toBe(true);
    });
  });

  describe('Game speed', () => {
    const group = () => root.querySelector<HTMLElement>('[role="group"][data-testid="game-speed"]');
    const button = (n: number) => root.querySelector<HTMLButtonElement>(`button[data-testid="game-speed-${n}"]`)!;
    const pressed = () => [1, 2, 3].filter((n) => button(n).getAttribute('aria-pressed') === 'true');

    it('is a group named "Game speed" with ×1, ×2 and ×3, the current one pressed', () => {
      mountHud(root, newGame(), fakeSpeed());
      expect(group()?.getAttribute('aria-label')).toBe('Game speed');
      expect([1, 2, 3].map((n) => button(n).textContent)).toEqual(['×1', '×2', '×3']);
      expect(pressed()).toEqual([1]);
      expect([1, 2, 3].some((n) => button(n).disabled)).toBe(false);
    });

    it('clicking a speed sets it directly, never passing through another', () => {
      const seen: GameSpeed[] = [];
      let speed: GameSpeed = 3;
      mountHud(root, newGame(), {
        get: () => speed,
        set: (next) => {
          seen.push(next);
          speed = next;
        },
      });
      button(1).click();
      expect(seen).toEqual([1]);
      expect(pressed()).toEqual([1]);
      button(3).click();
      expect(seen).toEqual([1, 3]);
      expect(pressed()).toEqual([3]);
    });

    it('follows a speed set elsewhere on the next update', () => {
      const speed = fakeSpeed();
      const hud = mountHud(root, newGame(), speed);
      speed.set(3);
      hud.update();
      expect(pressed()).toEqual([3]);
    });

    it('works during a wave', () => {
      const game = newGame();
      const speed = fakeSpeed();
      const hud = mountHud(root, game, speed);
      game.callNextWave();
      hud.update();
      button(2).click();
      expect(speed.get()).toBe(2);
    });

    it('is disabled once the game is over', () => {
      const game = newGame(1);
      const hud = mountHud(root, game, fakeSpeed());
      playWave(game);
      hud.update();
      expect(game.state.phase).toBe('defeat');
      expect([1, 2, 3].every((n) => button(n).disabled)).toBe(true);
    });
  });

  // The banner is a live region: it stays in place and only its text changes, so screen readers announce it.
  describe('Wave cleared banner', () => {
    const banner = () => root.querySelector<HTMLElement>('[role="status"][data-testid="wave-banner"]');

    it('is an empty, visible status region at first', () => {
      mountHud(root, newGame(), fakeSpeed());
      expect(banner()?.hidden).toBe(false);
      expect(banner()?.textContent).toBe('');
    });

    it('shows "Wave N cleared" when a wave is cleared', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      playWave(game);
      hud.update();
      expect(banner()?.textContent).toBe('Wave 1 cleared');
    });

    it('empties after WAVE_BANNER_MS of sim time', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
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
      const hud = mountHud(root, game, fakeSpeed());
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
      mountHud(root, armed(), fakeSpeed());
      expect(dps()).toBe('DPS –');
    });

    it('shows the rounded wave DPS during a wave', () => {
      const game = armed();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
      for (let t = 0; t < 1500; t += 100) game.tick(100);
      hud.update();
      expect(game.state.stats.wave.damage).toBeGreaterThan(0);
      expect(dps()).toBe(rounded(game));
    });

    it("keeps the last wave's figure after waveCleared", () => {
      const game = armed();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
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
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
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

  describe('wave timers (timed mode)', () => {
    const button = () => root.querySelector<HTMLButtonElement>('button[data-testid="start-wave"]');
    const nextWave = () => byTestId('hud-next-wave');

    it('the button is "Call next wave", and calls the next wave in during a wave too', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(button()?.textContent).toBe('Call next wave');
      button()!.click();
      expect(game.state.waveNumber).toBe(1);
      hud.update();
      expect(button()?.disabled).toBe(false);
      button()!.click();
      expect(game.state.activeWaves).toEqual([1, 2]);
    });

    it('is disabled once every wave has started', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
      game.callNextWave();
      hud.update();
      expect(button()?.disabled).toBe(true);
    });

    it('shows "Next wave in N", in whole seconds rounded up, during the build window and during a wave', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(nextWave()?.textContent).toBe('Next wave in 10');
      game.tick(TIMER_MS - 1500);
      hud.update();
      expect(nextWave()?.textContent).toBe('Next wave in 2');
      game.tick(1500);
      hud.update();
      expect(game.state.phase).toBe('wave');
      expect(nextWave()?.textContent).toBe('Next wave in 10');
    });

    it('shows no countdown once the last wave has started', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
      game.callNextWave();
      hud.update();
      expect(nextWave()?.textContent).toBe('');
    });

    it('shows overlapping waves in the counter: "Waves 1–2 / 2"', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
      hud.update();
      expect(byTestId('hud-wave')?.textContent).toBe('Wave 1 / 2');
      game.callNextWave();
      hud.update();
      expect(byTestId('hud-wave')?.textContent).toBe('Waves 1–2 / 2');
    });

    it('Space calls the next wave in, but not while a button or field has focus', () => {
      const game = timedGame();
      mountHud(root, game, fakeSpeed());
      const space = (target: EventTarget) =>
        target.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }),
        );
      space(document.body);
      expect(game.state.waveNumber).toBe(1);
      button()!.focus();
      space(button()!);
      expect(game.state.waveNumber).toBe(1);
    });

    it('Tactical mode shows no countdown, ever', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(nextWave()?.textContent).toBe('');
      playWave(game);
      hud.update();
      expect(nextWave()?.textContent).toBe('');
    });
  });

  it("update() doesn't rewrite text that hasn't changed", () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
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
    const hud = mountHud(root, game, fakeSpeed());
    hud.destroy();
    expect(root.children).toHaveLength(0);
    playWave(game);
    expect(root.children).toHaveLength(0);
    expect(root.textContent).toBe('');
  });
});
