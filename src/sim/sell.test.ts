import { describe, expect, it } from 'vitest';
import { DISMANTLE_MS, SELL_REFUND } from '../data/towers';
import { createGame, TICK_MS, type Game } from './game';
import type { MapData } from './map';
import type { WaveData } from './waves';

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

const ONE_INFANTRY: readonly WaveData[] = [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }];
const BESIDE_PATH = { col: 1, row: 2 };
const FAR_FROM_PATH = { col: 0, row: 4 };

const newGame = (money = 300, waves: readonly WaveData[] = [], lives = 20) =>
  createGame({ map: SMALL, lives, money, waves });

function place(game: Game, tile = BESIDE_PATH): number {
  const result = game.placeTower('rifleNest', tile);
  if (!result.ok) throw new Error(`placeTower refused: ${result.reason}`);
  return result.towerId;
}

const DISMANTLE_TICKS = Math.ceil(DISMANTLE_MS / TICK_MS);
const tickFor = (game: Game, ms: number) => {
  for (let elapsed = 0; elapsed < ms - 1e-6; elapsed += TICK_MS) game.tick(TICK_MS);
};

describe('sellTower', () => {
  it('starts dismantling: nothing is refunded and the tile stays occupied before 2 s', () => {
    const game = newGame(100);
    const id = place(game);
    expect(DISMANTLE_MS).toBe(2000);
    expect(game.sellTower(id)).toEqual({ ok: true, refund: 35 });
    tickFor(game, DISMANTLE_MS - 100);
    expect(game.state.towers).toHaveLength(1);
    expect(game.state.towers[0]!.dismantleMs).toBeGreaterThan(0);
    expect(game.state.money).toBe(50);
    expect(game.canPlaceTower('rifleNest', BESIDE_PATH)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('after 2 s removes the tower, refunds 70% of spent rounded down and emits towerSold', () => {
    const game = newGame(100);
    const id = place(game);
    const sold: unknown[] = [];
    game.events.on('towerSold', (e) => sold.push(e));
    expect(SELL_REFUND).toBe(0.7);
    game.sellTower(id);
    for (let i = 0; i < DISMANTLE_TICKS; i++) game.tick(TICK_MS);
    expect(game.state.towers).toEqual([]);
    expect(game.state.money).toBe(85);
    expect(sold).toEqual([{ towerId: id, tile: BESIDE_PATH, refund: 35 }]);
    expect(game.canPlaceTower('rifleNest', BESIDE_PATH)).toEqual({ ok: true });
  });

  it('an upgraded tower refunds 70% of everything put in', () => {
    const game = newGame(300);
    const id = place(game);
    game.upgradeTower(id);
    game.upgradeTower(id);
    const before = game.state.money;
    expect(game.sellTower(id)).toEqual({ ok: true, refund: 112 }); // floor(0.7 * 160)
    tickFor(game, DISMANTLE_MS);
    expect(game.state.money).toBe(before + 112);
  });

  it('a dismantling tower stops firing that tick', () => {
    const game = newGame(300, ONE_INFANTRY);
    const id = place(game);
    const shots: unknown[] = [];
    game.events.on('towerFired', (s) => shots.push(s));
    game.startWave();
    game.sellTower(id);
    tickFor(game, 500);
    expect(shots).toEqual([]);
  });

  it('can be sold during the Build phase, where the countdown still runs', () => {
    const game = newGame(100, ONE_INFANTRY);
    const id = place(game);
    expect(game.state.phase).toBe('build');
    game.sellTower(id);
    tickFor(game, DISMANTLE_MS);
    expect(game.state.towers).toEqual([]);
  });

  it("can't be upgraded or sold again while dismantling", () => {
    const game = newGame(300);
    const id = place(game);
    game.sellTower(id);
    const money = game.state.money;
    expect(game.sellTower(id)).toEqual({ ok: false, reason: 'dismantling' });
    expect(game.canSellTower(id)).toEqual({ ok: false, reason: 'dismantling' });
    expect(game.upgradeTower(id)).toEqual({ ok: false, reason: 'dismantling' });
    expect(game.state.money).toBe(money);
  });

  it('refuses noSuchTower, changing nothing', () => {
    const game = newGame(300);
    const id = place(game);
    const money = game.state.money;
    expect(game.sellTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    expect(game.canSellTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    expect(game.canSellTower(id)).toEqual({ ok: true, refund: 35 });
    expect(game.state.towers).toHaveLength(1);
    expect(game.state.money).toBe(money);
  });

  it('refuses gameEnded, changing nothing', () => {
    const game = newGame(300, ONE_INFANTRY, 1);
    const id = place(game, FAR_FROM_PATH);
    game.startWave();
    for (let i = 0; i < 60 * 60 && game.state.phase === 'wave'; i++) game.tick(TICK_MS);
    expect(game.state.phase).toBe('defeat');
    const money = game.state.money;
    expect(game.sellTower(id)).toEqual({ ok: false, reason: 'gameEnded' });
    expect(game.state.money).toBe(money);
    expect(game.state.towers).toHaveLength(1);
  });

  it('is not refunded if the game ends first', () => {
    const play = (sellAtTick?: number) => {
      const game = newGame(300, ONE_INFANTRY, 1);
      const id = place(game, FAR_FROM_PATH);
      game.startWave();
      let ticks = 0;
      for (; ticks < 60 * 60 && game.state.phase === 'wave'; ticks++) {
        if (ticks === sellAtTick) game.sellTower(id);
        game.tick(TICK_MS);
      }
      return { game, ticks };
    };
    const { ticks } = play();
    const sold: unknown[] = [];
    // Sold 30 ticks (0.5 s) before the leak, so the 2 s are not up when the game ends.
    const { game } = play(ticks - 30);
    game.events.on('towerSold', (e) => sold.push(e));
    expect(game.state.phase).toBe('defeat');
    expect(game.state.money).toBe(250);
    expect(game.state.towers).toHaveLength(1);
    expect(sold).toEqual([]);
  });
});
