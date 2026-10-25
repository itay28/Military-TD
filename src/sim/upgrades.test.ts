import { describe, expect, it } from 'vitest';
import { createGame, TICK_MS, type Game } from './game';
import type { MapData } from './map';
import type { WaveData } from './waves';

// Path line through tile centers: right along row 1 from col 0 to 3, then down col 3 to row 4.
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

const ONE_INFANTRY: readonly WaveData[] = [{ kind: 'infantry', count: 1, spacingMs: 0 }];
const BESIDE_PATH = { col: 1, row: 2 };
// 3 tiles from the nearest Path tile center, out of a Rifle Nest's 2.5 range (and 3 at level 2).
const FAR_FROM_PATH = { col: 0, row: 4 };

const newGame = (money = 300, { lives = 20, waves = [] as readonly WaveData[] } = {}) =>
  createGame({ map: SMALL, lives, money, waves });

/** Places a Rifle Nest on `tile` and returns its id. */
function place(game: Game, tile = BESIDE_PATH): number {
  const result = game.placeTower('rifleNest', tile);
  if (!result.ok) throw new Error(`placeTower refused: ${result.reason}`);
  return result.towerId;
}

/** Money and towers, to check a refused command changed nothing. */
const snapshot = (game: Game) => structuredClone({ money: game.state.money, towers: game.state.towers });

describe('upgradeTower', () => {
  it('a placed tower is at level 1 and has spent its cost', () => {
    const game = newGame();
    place(game);
    expect(game.state.towers[0]).toMatchObject({ level: 1, spent: 50 });
  });

  it('spends the cost, raises the level and switches to the new stats', () => {
    const game = newGame(300);
    const id = place(game);
    expect(game.upgradeTower(id)).toEqual({ ok: true, level: 2 });
    expect(game.state.money).toBe(210);
    expect(game.state.towers[0]).toMatchObject({ id, level: 2, range: 3, damage: 10, fireRate: 2 });
    expect(game.upgradeTower(id)).toEqual({ ok: true, level: 3 });
    expect(game.state.money).toBe(140);
    expect(game.state.towers[0]).toMatchObject({ id, level: 3, range: 3, damage: 16, fireRate: 2.5 });
  });

  it('spent adds up the placement and every upgrade, and the placement cost stays', () => {
    const game = newGame(300);
    const id = place(game);
    game.upgradeTower(id);
    expect(game.state.towers[0]).toMatchObject({ spent: 90, cost: 50 });
    game.upgradeTower(id);
    expect(game.state.towers[0]).toMatchObject({ spent: 160, cost: 50 });
  });

  it('keeps the tower on its tile, and its cooldown', () => {
    const game = newGame(300, { waves: ONE_INFANTRY });
    const id = place(game);
    game.startWave();
    game.tick(TICK_MS); // fires its first shot
    const { cooldownMs, tile } = game.state.towers[0]!;
    expect(cooldownMs).toBeGreaterThan(0);
    expect(game.upgradeTower(id)).toMatchObject({ ok: true });
    expect(game.state.towers[0]).toMatchObject({ cooldownMs, tile });
  });

  it('works in the Wave phase too', () => {
    const game = newGame(300, { waves: ONE_INFANTRY });
    const id = place(game);
    game.startWave();
    expect(game.state.phase).toBe('wave');
    expect(game.upgradeTower(id)).toEqual({ ok: true, level: 2 });
  });

  it('an upgraded tower hits harder: level 3 kills an Infantry in 2 shots', () => {
    const game = newGame(300, { waves: ONE_INFANTRY });
    const id = place(game);
    game.upgradeTower(id);
    game.upgradeTower(id);
    const shots: number[] = [];
    game.events.on('towerFired', (shot) => shots.push(shot.hits[0]!.damage));
    game.startWave();
    for (let t = 0; t < 10_000 && game.state.phase === 'wave'; t += TICK_MS) game.tick(TICK_MS);
    expect(shots).toEqual([16, 14]);
  });
});

describe('upgradeTower refusals', () => {
  it('gameEnded after Defeat, before any other reason', () => {
    const game = newGame(300, { lives: 1, waves: ONE_INFANTRY });
    const id = place(game, FAR_FROM_PATH);
    game.startWave();
    for (let t = 0; t < 10_000 && game.state.phase === 'wave'; t += TICK_MS) game.tick(TICK_MS);
    expect(game.state.phase).toBe('defeat');
    const before = snapshot(game);
    expect(game.upgradeTower(id)).toEqual({ ok: false, reason: 'gameEnded' });
    expect(game.upgradeTower(999)).toEqual({ ok: false, reason: 'gameEnded' });
    expect(snapshot(game)).toEqual(before);
  });

  it('noSuchTower for an id no standing tower has', () => {
    const game = newGame();
    place(game);
    const before = snapshot(game);
    expect(game.upgradeTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    expect(snapshot(game)).toEqual(before);
  });

  it('maxLevel at level 3, before insufficientMoney', () => {
    const game = newGame(50 + 40 + 70);
    const id = place(game);
    game.upgradeTower(id);
    game.upgradeTower(id);
    expect(game.state.money).toBe(0);
    const before = snapshot(game);
    expect(game.upgradeTower(id)).toEqual({ ok: false, reason: 'maxLevel' });
    expect(snapshot(game)).toEqual(before);
  });

  it('insufficientMoney when Money is below the next level cost', () => {
    const game = newGame(50 + 39);
    const id = place(game);
    const before = snapshot(game);
    expect(game.upgradeTower(id)).toEqual({ ok: false, reason: 'insufficientMoney' });
    expect(snapshot(game)).toEqual(before);
  });
});

describe('canUpgradeTower', () => {
  it('answers like upgradeTower and changes nothing', () => {
    const game = newGame(50 + 40 + 69);
    const id = place(game);
    expect(game.canUpgradeTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    const before = snapshot(game);
    expect(game.canUpgradeTower(id)).toEqual({ ok: true });
    expect(snapshot(game)).toEqual(before);
    game.upgradeTower(id);
    expect(game.canUpgradeTower(id)).toEqual({ ok: false, reason: 'insufficientMoney' });
  });
});
