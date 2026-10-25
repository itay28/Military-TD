import { describe, expect, it } from 'vitest';
import { SELL_REFUND } from '../data/towers';
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

const ONE_INFANTRY: readonly WaveData[] = [{ kind: 'infantry', count: 1, spacingMs: 0 }];
const BESIDE_PATH = { col: 1, row: 2 };
const FAR_FROM_PATH = { col: 0, row: 4 };

const newGame = (money = 300, waves: readonly WaveData[] = [], lives = 20) =>
  createGame({ map: SMALL, lives, money, waves });

function place(game: Game, tile = BESIDE_PATH): number {
  const result = game.placeTower('rifleNest', tile);
  if (!result.ok) throw new Error(`placeTower refused: ${result.reason}`);
  return result.towerId;
}

describe('sellTower', () => {
  it('refunds 70% of spent, rounded down, removes the tower and emits towerSold', () => {
    const game = newGame(100);
    const id = place(game);
    const sold: unknown[] = [];
    game.events.on('towerSold', (e) => sold.push(e));
    expect(SELL_REFUND).toBe(0.7);
    expect(game.sellTower(id)).toEqual({ ok: true, refund: 35 });
    expect(game.state.towers).toEqual([]);
    expect(game.state.money).toBe(85);
    expect(sold).toEqual([{ towerId: id, tile: BESIDE_PATH, refund: 35 }]);
  });

  it('an upgraded tower refunds 70% of everything put in', () => {
    const game = newGame(300);
    const id = place(game);
    game.upgradeTower(id);
    game.upgradeTower(id);
    const before = game.state.money;
    expect(game.sellTower(id)).toEqual({ ok: true, refund: 112 }); // floor(0.7 * 160)
    expect(game.state.money).toBe(before + 112);
  });

  it('frees the tile for a new tower', () => {
    const game = newGame(300);
    const id = place(game);
    game.sellTower(id);
    expect(game.canPlaceTower('rifleNest', BESIDE_PATH)).toEqual({ ok: true });
  });

  it('refuses noSuchTower, changing nothing', () => {
    const game = newGame(300);
    const id = place(game);
    const money = game.state.money;
    expect(game.sellTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    expect(game.canSellTower(999)).toEqual({ ok: false, reason: 'noSuchTower' });
    expect(game.canSellTower(id)).toEqual({ ok: true });
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

  it('works during a wave, and the tower stops firing that tick', () => {
    const game = newGame(300, ONE_INFANTRY);
    const id = place(game);
    const shots: unknown[] = [];
    game.events.on('towerFired', (s) => shots.push(s));
    game.startWave();
    expect(game.sellTower(id)).toMatchObject({ ok: true });
    game.tick(TICK_MS);
    expect(shots).toEqual([]);
  });
});
