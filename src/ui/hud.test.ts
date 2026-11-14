// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEMY_WEAKNESS, WAVE_BANNER_MS } from '../data/display';
import { createGame, type Game } from '../sim/game';
import type { Enemy } from '../sim/enemies';
import type { MapData } from '../sim/map';
import { waveDps } from '../sim/stats';
import type { GameSpeed } from '../scenes/gameSpeed';
import { mountHud, type HudSpeed } from './hud';
import type { RenderIcon } from './renderIcon';
import type { EnemyKind } from '../data/enemies';
import type { WaveData, WaveGroup } from '../sim/waves';

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
  it('shows the starting Funds, HQ and "Wave 0 / N"', () => {
    mountHud(root, newGame(), fakeSpeed());
    expect(byTestId('hud-money')?.textContent).toBe('Funds $100');
    expect(byTestId('hud-lives')?.textContent).toBe('HQ20/20');
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 0 / 2');
  });

  describe('difficulty tag (#465)', () => {
    const gameOn = (difficulty: 'normal' | 'hard'): Game =>
      createGame({
        map: SMALL,
        money: 100,
        lives: 20,
        difficulty,
        tacticalMode: true,
        waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 100, delayMs: 0 }] }],
      });

    it('says "Hard" in the stats group on Hard', () => {
      mountHud(root, gameOn('hard'), fakeSpeed());
      const tag = byTestId('hud-difficulty');
      expect(tag?.textContent).toBe('Hard');
      expect(tag?.parentElement?.className).toBe('hud-stats');
    });

    it('keeps the tag slot on Normal, empty, so the layout is the same on both (#569)', () => {
      mountHud(root, gameOn('normal'), fakeSpeed());
      const tag = byTestId('hud-difficulty');
      expect(tag?.textContent).toBe('');
      expect(tag?.parentElement?.className).toBe('hud-stats');
    });

    it('puts the next-wave timer in the stats group, not the clipping message slot (#569)', () => {
      mountHud(root, gameOn('normal'), fakeSpeed());
      expect(byTestId('hud-next-wave')?.parentElement?.className).toBe('hud-stats');
    });
  });

  it('HQ drops on the next update after a leak', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    playWave(game);
    hud.update();
    expect(byTestId('hud-lives')?.textContent).toBe('HQ19/20');
  });

  describe('HQ bar', () => {
    const hq = () => byTestId('hud-lives')!;
    const fill = () => hq().querySelector<HTMLElement>('.hq-fill')!;

    it('is a meter named HQ, read as "HQ 20 of 20"', () => {
      mountHud(root, newGame(), fakeSpeed());
      expect(hq().getAttribute('role')).toBe('meter');
      expect(hq().getAttribute('aria-label')).toBe('HQ');
      expect(hq().getAttribute('aria-valuemin')).toBe('0');
      expect(hq().getAttribute('aria-valuemax')).toBe('20');
      expect(hq().getAttribute('aria-valuenow')).toBe('20');
      expect(hq().getAttribute('aria-valuetext')).toBe('HQ 20 of 20');
    });

    it('its max is the Lives the game started with', () => {
      mountHud(root, newGame(8), fakeSpeed());
      expect(hq().getAttribute('aria-valuemax')).toBe('8');
      expect(hq().textContent).toBe('HQ8/8');
    });

    it('shrinks and is re-read after a leak', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(fill().style.width).toBe('100%');
      playWave(game);
      hud.update();
      expect(hq().getAttribute('aria-valuenow')).toBe('19');
      expect(hq().getAttribute('aria-valuetext')).toBe('HQ 19 of 20');
      expect(fill().style.width).toBe('95%');
    });

    it('marks its level: ok, then low at half, then critical', () => {
      const game = newGame(2);
      const hud = mountHud(root, game, fakeSpeed());
      expect(hq().dataset.level).toBe('ok');
      playWave(game);
      hud.update();
      expect(hq().dataset.level).toBe('low');
    });
  });

  it('Money drops on the next update after a tower is placed', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    expect(game.placeTower('rifleNest', { col: 1, row: 0 })).toMatchObject({ ok: true });
    hud.update();
    expect(byTestId('hud-money')?.textContent).toBe('Funds $50');
  });

  it('the wave counter shows the started wave', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.callNextWave();
    hud.update();
    expect(byTestId('hud-wave')?.textContent).toBe('Wave 1 / 2');
  });

  describe('Start wave (Tactical mode)', () => {
    const button = () => root.querySelector<HTMLButtonElement>('button[data-testid="start-wave"]');

    it('is a "Start wave" button, enabled in the Build phase', () => {
      mountHud(root, newGame(), fakeSpeed());
      expect(button()?.textContent).toBe('Start wave');
      expect(button()?.disabled).toBe(false);
    });

    it('clicking it starts the next wave', () => {
      const game = newGame();
      mountHud(root, game, fakeSpeed());
      button()!.click();
      expect(game.state.phase).toBe('wave');
      expect(game.state.waveNumber).toBe(1);
    });

    it('startWave() does what a click does, for the Space key', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      hud.startWave();
      expect(game.state.phase).toBe('wave');
      expect(button()!.disabled).toBe(true);
    });

    it('startWave() does nothing while the button is disabled', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      const startWave = vi.spyOn(game, 'callNextWave');
      hud.startWave();
      hud.startWave();
      expect(startWave).toHaveBeenCalledOnce();
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

    it('shows "CONTACT — WAVE N" when a wave starts, for WAVE_BANNER_MS', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.callNextWave();
      hud.update();
      expect(banner()?.textContent).toBe('CONTACT — WAVE 1');
      game.tick(WAVE_BANNER_MS - 1);
      hud.update();
      expect(banner()?.textContent).toBe('CONTACT — WAVE 1');
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

    it('is a button that opens and closes the DPS meter', () => {
      mountHud(root, armed(), fakeSpeed());
      const button = byTestId('hud-dps') as HTMLButtonElement;
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('aria-controls')).toBe('dps-meter');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(byTestId('dps-meter')?.hidden).toBe(true);
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(byTestId('dps-meter')?.hidden).toBe(false);
      expect(byTestId('dps-kind-rifleNest')).not.toBeNull();
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(byTestId('dps-meter')?.hidden).toBe(true);
    });

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

    it('shows "Next Ns", in whole seconds rounded up, during the build window and during a wave', () => {
      const game = timedGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(nextWave()?.textContent).toBe('Next 10s');
      game.tick(TIMER_MS - 1500);
      hud.update();
      expect(nextWave()?.textContent).toBe('Next 2s');
      game.tick(1500);
      hud.update();
      expect(game.state.phase).toBe('wave');
      expect(nextWave()?.textContent).toBe('Next 10s');
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

describe('boss HP bar', () => {
  const bar = () => byTestId('hud-boss')!;
  const meter = () => bar().querySelector<HTMLElement>('[role="meter"]')!;
  const fill = () => bar().querySelector<HTMLElement>('.boss-fill')!;
  /** Sets the HP of the enemy with `id`, as a hit would. */
  const setHp = (game: Game, id: number, hp: number) => {
    const enemies = game.state.enemies as Enemy[];
    const i = enemies.findIndex((e) => e.id === id);
    enemies[i] = { ...enemies[i]!, hp };
  };

  it('is hidden while no boss is on the field', () => {
    mountHud(root, newGame(), fakeSpeed());
    expect(bar().hidden).toBe(true);
  });

  it('stays hidden with only ordinary enemies on the field', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.spawnEnemy('infantry');
    game.spawnEnemy('tank');
    hud.update();
    expect(bar().hidden).toBe(true);
  });

  it('shows the boss name and a full bar once a Heavy tank is on the field', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.spawnEnemy('heavyTank');
    hud.update();
    expect(bar().hidden).toBe(false);
    expect(bar().textContent).toContain('Heavy tank');
    expect(bar().textContent).toContain('1500/1500');
    expect(fill().style.width).toBe('100%');
  });

  it('is a meter named after the boss, read as "Heavy tank 1500 of 1500 HP"', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.spawnEnemy('heavyTank');
    hud.update();
    expect(meter().getAttribute('aria-label')).toBe('Heavy tank');
    expect(meter().getAttribute('aria-valuemin')).toBe('0');
    expect(meter().getAttribute('aria-valuemax')).toBe('1500');
    expect(meter().getAttribute('aria-valuenow')).toBe('1500');
    expect(meter().getAttribute('aria-valuetext')).toBe('Heavy tank 1500 of 1500 HP');
  });

  it('drops its HP figure and fill after the boss takes damage', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    const id = game.spawnEnemy('heavyTank');
    hud.update();
    setHp(game, id, 375);
    hud.update();
    expect(bar().textContent).toContain('375/1500');
    expect(fill().style.width).toBe('25%');
    expect(meter().getAttribute('aria-valuenow')).toBe('375');
    expect(meter().getAttribute('aria-valuetext')).toBe('Heavy tank 375 of 1500 HP');
  });

  it('rounds a fractional HP up, so a boss still alive never reads 0', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    const id = game.spawnEnemy('heavyTank');
    setHp(game, id, 0.4);
    hud.update();
    expect(bar().textContent).toContain('1/1500');
  });

  it('hides again once the boss is gone from the field', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    game.spawnEnemy('heavyTank');
    hud.update();
    // 0.4 tiles/s down a 6-tile Path: it leaks after 15 s.
    game.tick(16_000);
    hud.update();
    expect(game.state.enemies).toHaveLength(0);
    expect(bar().hidden).toBe(true);
  });

  it('follows the boss nearest the HQ when two are on the field', () => {
    const game = newGame();
    const hud = mountHud(root, game, fakeSpeed());
    const first = game.spawnEnemy('heavyTank');
    game.tick(1000);
    game.spawnEnemy('heavyTank');
    setHp(game, first, 900);
    hud.update();
    expect(bar().textContent).toContain('900/1500');
  });

  describe('with the Gunship', () => {
    it('shows "Gunship" and its full HP, as a meter', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.spawnEnemy('gunship');
      hud.update();
      expect(bar().hidden).toBe(false);
      expect(bar().textContent).toContain('Gunship');
      expect(bar().textContent).toContain('1200/1200');
      expect(fill().style.width).toBe('100%');
      expect(meter().getAttribute('aria-valuetext')).toBe('Gunship 1200 of 1200 HP');
    });

    it('drops its HP after damage', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      const id = game.spawnEnemy('gunship');
      hud.update();
      setHp(game, id, 300);
      hud.update();
      expect(bar().textContent).toContain('300/1200');
      expect(fill().style.width).toBe('25%');
    });

    it('hides again once the Gunship leaks', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      game.spawnEnemy('gunship');
      hud.update();
      // 0.8 tiles/s down a 6-tile Path: it leaks after 7.5 s.
      game.tick(8000);
      hud.update();
      expect(game.state.enemies).toHaveLength(0);
      expect(bar().hidden).toBe(true);
    });

    it('hides again once the Gunship dies', () => {
      const game = newGame();
      const hud = mountHud(root, game, fakeSpeed());
      expect(game.placeTower('aaGun', { col: 1, row: 0 })).toMatchObject({ ok: true });
      const id = game.spawnEnemy('gunship');
      setHp(game, id, 1);
      hud.update();
      expect(bar().hidden).toBe(false);
      game.tick(1000);
      hud.update();
      expect(game.state.enemies).toHaveLength(0);
      expect(game.state.lives).toBe(20);
      expect(bar().hidden).toBe(true);
    });
  });
});

describe('Sniper intel (#353)', () => {
  const g = (kind: WaveGroup['kind'], count: number, delayMs = 0): WaveGroup => ({
    kind,
    count,
    spacingMs: 100,
    delayMs,
  });
  const WAVES: WaveData[] = [
    { groups: [g('infantry', 1)], afterMs: TIMER_MS },
    { groups: [g('jeep', 1, 500), g('tank', 2)], afterMs: TIMER_MS },
    { groups: [g('helicopter', 1)], afterMs: TIMER_MS },
  ];
  const intelGame = (tacticalMode = false) =>
    createGame({ map: SMALL, money: 1000, lives: 20, tacticalMode, waves: WAVES });
  const mount = (game: Game, iconFor?: (kind: EnemyKind) => RenderIcon | null) =>
    mountHud(root, game, fakeSpeed(), iconFor ? { iconFor } : {});
  const intel = () => byTestId('hud-intel')!;
  const shown = () =>
    intel().hidden
      ? []
      : [...intel().querySelectorAll<HTMLElement>('[data-testid="intel-wave"]')].map((w) => ({
          wave: Number(w.dataset.wave),
          kinds: [...w.querySelectorAll<HTMLElement>('[data-testid="intel-kind"]')].map((k) => k.textContent),
        }));
  const hint = () => {
    const el = byTestId('intel-hint');
    return !intel().hidden && !!el && !el.hidden;
  };
  const SNIPER_TILE = { col: 1, row: 0 };

  it('without a Sniper there is no preview, only the hint "Build a Sniper for intel"', () => {
    const hud = mount(intelGame());
    hud.update();
    expect(shown()).toEqual([]);
    expect(hint()).toBe(true);
    expect(byTestId('intel-hint')!.textContent).toBe('Build a Sniper for intel');
  });

  it('the hint shows once per game: gone after the wave it was shown for starts', () => {
    const game = intelGame();
    const hud = mount(game);
    hud.update();
    expect(hint()).toBe(true);
    game.callNextWave();
    hud.update();
    expect(hint()).toBe(false);
    game.tick(TIMER_MS);
    hud.update();
    expect(hint()).toBe(false);
  });

  it('a Sniper shows the next wave: icon, count and name for each kind, in order of first appearance', () => {
    const game = intelGame();
    const hud = mount(game);
    game.placeTower('sniper', SNIPER_TILE);
    game.callNextWave();
    hud.update();
    expect(hint()).toBe(false);
    expect(shown()).toEqual([{ wave: 2, kinds: ['2 Tank', '1 Jeep'] }]);
    expect(intel().querySelectorAll('[data-testid="intel-kind"] .intel-icon')).toHaveLength(2);
  });

  it("a kind's icon is its render when there is one, else the shape fallback", () => {
    const game = intelGame();
    const hud = mount(game, (kind) => (kind === 'tank' ? { layerUrls: ['tank.png'], canvasPx: 64 } : null));
    game.placeTower('sniper', SNIPER_TILE);
    game.callNextWave();
    hud.update();
    const icon = (kind: string) => intel().querySelector<HTMLElement>(`[data-kind="${kind}"] .intel-icon`)!;
    expect(icon('tank').querySelector('.build-icon-layer')).not.toBeNull();
    expect(icon('jeep').querySelector('.intel-shape')).not.toBeNull();
  });

  it('hover, focus or tap on a kind shows its weakness line and armor', () => {
    const game = intelGame();
    const hud = mount(game);
    game.placeTower('sniper', SNIPER_TILE);
    hud.update();
    const chip = intel().querySelector<HTMLElement>('[data-kind="infantry"]')!;
    const tip = byTestId('intel-tip')!;
    expect(tip.hidden).toBe(true);
    chip.dispatchEvent(new Event('mouseenter'));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe(`${ENEMY_WEAKNESS.infantry} Armor 0.`);
    chip.dispatchEvent(new Event('mouseleave'));
    expect(tip.hidden).toBe(true);
    chip.focus();
    expect(tip.hidden).toBe(false);
    expect(chip.getAttribute('aria-describedby')).toBe(tip.id);
    chip.blur();
    expect(tip.hidden).toBe(true);
    chip.click();
    expect(tip.hidden).toBe(false);
    chip.click();
    expect(tip.hidden).toBe(true);
  });

  it('a level-3 Sniper shows the wave after next as well', () => {
    const game = intelGame();
    const hud = mount(game);
    const placed = game.placeTower('sniper', SNIPER_TILE);
    if (!placed.ok) throw new Error(placed.reason);
    game.upgradeTower(placed.towerId);
    hud.update();
    expect(shown()).toHaveLength(1);
    game.upgradeTower(placed.towerId);
    hud.update();
    expect(shown()).toEqual([
      { wave: 1, kinds: ['1 Infantry'] },
      { wave: 2, kinds: ['2 Tank', '1 Jeep'] },
    ]);
  });

  it('a Sniper being dismantled gives no intel', () => {
    const game = intelGame();
    const hud = mount(game);
    const placed = game.placeTower('sniper', SNIPER_TILE);
    if (!placed.ok) throw new Error(placed.reason);
    hud.update();
    expect(shown()).toHaveLength(1);
    game.sellTower(placed.towerId);
    hud.update();
    expect(shown()).toEqual([]);
  });

  it('in timed mode it stays up during a wave, for the next wave to arrive', () => {
    const game = intelGame();
    const hud = mount(game);
    game.placeTower('sniper', SNIPER_TILE);
    game.callNextWave();
    game.tick(100);
    hud.update();
    expect(game.state.phase).toBe('wave');
    expect(shown().map((w) => w.wave)).toEqual([2]);
  });

  it('in Tactical mode it shows between waves and hides once the wave starts', () => {
    const game = intelGame(true);
    const hud = mount(game);
    game.placeTower('sniper', SNIPER_TILE);
    hud.update();
    expect(shown().map((w) => w.wave)).toEqual([1]);
    game.callNextWave();
    hud.update();
    expect(intel().hidden).toBe(true);
  });

  it('hides once the last wave has started', () => {
    const game = intelGame();
    const hud = mount(game);
    game.placeTower('sniper', SNIPER_TILE);
    game.callNextWave();
    game.callNextWave();
    hud.update();
    expect(shown().map((w) => w.wave)).toEqual([3]);
    game.callNextWave();
    hud.update();
    expect(intel().hidden).toBe(true);
  });
});
