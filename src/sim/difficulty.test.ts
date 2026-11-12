import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../data/difficulty';
import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { START_LIVES, START_MONEY } from '../data/start';
import { createGame, TICK_MS } from './game';
import type { MapData } from './map';
import { setUpGame } from './scenario';

const ENEMY_KINDS = Object.keys(ENEMY_STATS) as EnemyKind[];

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

const newGame = (difficulty?: 'normal' | 'hard') =>
  createGame({ map: SMALL, lives: 20, money: 100, waves: [], ...(difficulty && { difficulty }) });

describe('Difficulty in the sim', () => {
  it('a game is on Normal unless told otherwise', () => {
    expect(newGame().state.difficulty).toBe('normal');
    expect(newGame('hard').state.difficulty).toBe('hard');
  });

  it.each(ENEMY_KINDS)('Normal leaves a %s as its stats say', (kind) => {
    for (const game of [newGame(), newGame('normal')]) {
      game.spawnEnemy(kind);
      const enemy = game.state.enemies[0]!;
      const { maxHp, reward } = ENEMY_STATS[kind];
      expect({ maxHp: enemy.maxHp, hp: enemy.hp, reward: enemy.reward }).toEqual({ maxHp, hp: maxHp, reward });
    }
  });

  it.each(ENEMY_KINDS)('Hard scales a %s: more HP, a smaller reward, whole numbers, reward at least 1', (kind) => {
    const game = newGame('hard');
    game.spawnEnemy(kind);
    const enemy = game.state.enemies[0]!;
    const { hpScale, rewardScale } = DIFFICULTY.hard;
    const stats = ENEMY_STATS[kind];
    expect(enemy.maxHp).toBe(Math.round(stats.maxHp * hpScale));
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(enemy.reward).toBe(Math.max(1, Math.round(stats.reward * rewardScale)));
    expect(enemy.maxHp).toBeGreaterThan(stats.maxHp);
    expect(enemy.reward).toBeLessThanOrEqual(stats.reward);
    expect(enemy.reward).toBeGreaterThanOrEqual(1);
  });

  it('a kill on Hard pays the scaled reward', () => {
    const game = newGame('hard');
    const paid: number[] = [];
    game.events.on('enemyKilled', ({ reward }) => paid.push(reward));
    game.placeTower('rifleNest', { col: 1, row: 2 });
    const moneyAfterBuild = game.state.money;
    game.spawnEnemy('infantry');
    for (let t = 0; t < 20_000 && paid.length === 0; t += TICK_MS) game.tick(TICK_MS);
    const expected = Math.max(1, Math.round(ENEMY_STATS.infantry.reward * DIFFICULTY.hard.rewardScale));
    expect(paid).toEqual([expected]);
    expect(game.state.money).toBe(moneyAfterBuild + expected);
  });
});

describe('setUpGame and Difficulty', () => {
  it('Normal, or none, starts with the usual Lives and Money', () => {
    for (const state of [setUpGame().state, setUpGame({ difficulty: 'normal' }).state])
      expect({ lives: state.lives, money: state.money, difficulty: state.difficulty }).toEqual({
        lives: START_LIVES,
        money: START_MONEY,
        difficulty: 'normal',
      });
  });

  it("Hard starts with Hard's Lives and Money", () => {
    const { state } = setUpGame({ difficulty: 'hard' });
    expect({ lives: state.lives, money: state.money, difficulty: state.difficulty }).toEqual({
      lives: DIFFICULTY.hard.startLives,
      money: DIFFICULTY.hard.startMoney,
      difficulty: 'hard',
    });
  });

  it('explicit Lives and Money still win on Hard', () => {
    const { state } = setUpGame({ difficulty: 'hard', lives: 7, money: 333 });
    expect([state.lives, state.money]).toEqual([7, 333]);
  });
});
