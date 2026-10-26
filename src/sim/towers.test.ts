import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import { TOWER_STATS } from '../data/towers';
import type { Enemy } from './enemies';
import { createGame, TICK_MS, type Game } from './game';
import type { MapData, Tile } from './map';
import { fireTowers, selectTarget, towerAt, type Tower } from './towers';

// Path line through tile centers: right along y = 1.5 from x = 0.5 to 3.5, then down x = 3.5 to y = 4.5.
// Infantry walks 1.5 tiles/s, so tick(1000) puts a fresh enemy at distance 1.5, position (2, 1.5).
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

const newGame = () => createGame({ map: SMALL, lives: 20, money: 100, waves: [] });

/** Places a Rifle Nest and returns its id; fails the test if placement is refused. */
function place(game: Game, tile: Tile): number {
  const result = game.placeTower('rifleNest', tile);
  if (!result.ok) throw new Error(`placeTower refused: ${result.reason}`);
  return result.towerId;
}

describe('placeTower', () => {
  it('a placed Rifle Nest has its stats from data and is ready to fire', () => {
    const game = newGame();
    const id = place(game, { col: 2, row: 2 });
    expect(game.state.towers).toEqual([
      {
        id,
        kind: 'rifleNest',
        tile: { col: 2, row: 2 },
        cost: 50,
        range: 2.5,
        fireRate: 2,
        damage: 10,
        targets: ['ground', 'air'],
        cooldownMs: 0,
        level: 1,
        spent: 50,
      },
    ]);
    expect(place(game, { col: 1, row: 2 })).not.toBe(id);
  });

  it('a placed Mortar has its stats from data: long range, a minimum range, ground only, and shells', () => {
    const game = createGame({ map: SMALL, lives: 20, money: 200, waves: [] });
    const result = game.placeTower('mortar', { col: 5, row: 4 });
    expect(result.ok).toBe(true);
    expect(game.state.money).toBe(75);
    expect(game.state.towers).toEqual([
      expect.objectContaining({
        kind: 'mortar',
        range: 5,
        minRange: 1.5,
        fireRate: 1 / 3,
        damage: 40,
        targets: ['ground'],
        shell: { flightMs: 1000, innerRadius: 0.6, outerRadius: 1.25 },
      }),
    ]);
  });

  it('a tower with nothing in range stays ready, at 0 cooldown', () => {
    const game = newGame();
    place(game, { col: 5, row: 0 });
    game.tick(1000);
    expect(game.state.towers[0]!.cooldownMs).toBe(0);
  });
});

/** Records every towerFired event as [towerId, targetId]. */
function recordShots(game: Game) {
  const shots: [number, number][] = [];
  game.events.on('towerFired', ({ towerId, targetId }) => shots.push([towerId, targetId]));
  return shots;
}

/** Records the game time of every towerFired event. */
function recordShotTimes(game: Game) {
  const times: number[] = [];
  game.events.on('towerFired', () => times.push(game.state.timeMs));
  return times;
}

describe('range', () => {
  // Tower at tile (0, 3), center (0.5, 3.5). An enemy at distance 1.5, (2, 1.5), is 1.5 across and 2 up: exactly 2.5.
  it('a tower fires at an enemy exactly at its 2.5-tile range, for 10 damage', () => {
    const game = newGame();
    const shots = recordShots(game);
    const enemy = game.spawnEnemy('infantry');
    game.tick(1000);
    const tower = place(game, { col: 0, row: 3 });
    game.tick(0);
    expect(shots).toEqual([[tower, enemy]]);
    expect(game.state.enemies[0]!.hp).toBe(20);
  });

  it('a tower ignores an enemy just beyond its range', () => {
    const game = newGame();
    const shots = recordShots(game);
    game.spawnEnemy('infantry');
    game.tick(1010); // distance 1.515
    place(game, { col: 0, row: 3 });
    game.tick(0);
    expect(shots).toEqual([]);
    expect(game.state.enemies[0]!.hp).toBe(30);
  });
});

describe('targeting', () => {
  // e1 spawns, walks 1 s, e2 spawns, both walk 0.5 s: e1 at distance 2.25 (2.75, 1.5), e2 at 0.75 (1.25, 1.5).
  const twoEnemies = () => {
    const game = newGame();
    const shots = recordShots(game);
    const first = game.spawnEnemy('infantry');
    game.tick(1000);
    const second = game.spawnEnemy('infantry');
    game.tick(500);
    return { game, shots, first, second };
  };

  it('with several enemies in range, a tower targets the one furthest along the Path', () => {
    const { game, shots, first } = twoEnemies();
    game.spawnEnemy('infantry'); // a third, at the Path start
    const tower = place(game, { col: 2, row: 2 }); // center (2.5, 2.5): all three in range
    game.tick(0);
    expect(shots).toEqual([[tower, first]]);
  });

  it('"first" goes by distance along the Path, not spawn order', () => {
    // Every enemy kind walks at one speed today, so a game can't put a later spawn ahead; build them by hand.
    const game = newGame();
    place(game, { col: 2, row: 2 });
    const tower = game.state.towers[0]!;
    const enemy = (enemyId: number, distance: number): Enemy => ({
      ...ENEMY_STATS.infantry,
      id: enemyId,
      kind: 'infantry',
      hp: ENEMY_STATS.infantry.maxHp,
      distance,
      position: { x: 0.5 + distance, y: 1.5 },
    });
    expect(selectTarget(tower, [enemy(1, 1), enemy(2, 2), enemy(3, 0.5)])?.id).toBe(2);
    expect(selectTarget(tower, [enemy(1, 1), enemy(2, 1)])?.id).toBe(1); // a tie goes to the first spawned
  });

  it('an enemy further along but out of range is not targeted', () => {
    const { game, shots, second } = twoEnemies();
    const tower = place(game, { col: 0, row: 3 }); // e1 is about 3.0 away, e2 about 2.15
    game.tick(0);
    expect(shots).toEqual([[tower, second]]);
  });
});

describe('fire rate', () => {
  it('a Rifle Nest fires 2 shots per second: 6 shots 500 ms apart over 3 s of 1/60 s ticks', () => {
    const game = newGame();
    const times = recordShotTimes(game);
    for (let i = 0; i < 10; i++) game.spawnEnemy('infantry'); // 300 HP between them: never runs out
    place(game, { col: 1, row: 2 }); // in range of the whole first 5.5 tiles
    for (let i = 0; i < 180; i++) game.tick(TICK_MS);
    expect(times).toHaveLength(6);
    times.forEach((t, i) => expect(t).toBeCloseTo(TICK_MS + 500 * i, 6));
  });

  it('the fire rate holds with ticks that do not divide the cooldown: 6 shots in 3 s of 300 ms ticks', () => {
    const game = newGame();
    const times = recordShotTimes(game);
    for (let i = 0; i < 10; i++) game.spawnEnemy('infantry');
    place(game, { col: 1, row: 2 });
    for (let i = 0; i < 10; i++) game.tick(300);
    // Each shot lands on the first tick at or after it is due (300, then every 500 ms).
    expect(times).toEqual([300, 900, 1500, 1800, 2400, 3000]);
  });

  it('an idle tower fires on the first tick an enemy enters range, then 30 ticks later', () => {
    // Tower at (2, 4), center (2.5, 4.5). The enemy comes within 2.5 at distance 3 + 2 − √5.25 ≈ 3.709,
    // which is 2.473 s ≈ tick 148.4, so the first shot is on tick 149.
    const game = newGame();
    const shotTicks: number[] = [];
    let ticks = 0;
    game.events.on('towerFired', () => shotTicks.push(ticks));
    place(game, { col: 2, row: 4 });
    game.spawnEnemy('infantry');
    for (ticks = 1; ticks <= 180; ticks++) game.tick(TICK_MS);
    expect(shotTicks).toEqual([149, 179]);
  });
});

describe('kills', () => {
  it('three 10-damage shots kill a 30 HP Infantry: it is removed and enemyKilled fires once with its reward', () => {
    const game = newGame();
    const shots = recordShots(game);
    const kills: unknown[] = [];
    game.events.on('enemyKilled', (e) => kills.push(e));
    const id = game.spawnEnemy('infantry');
    place(game, { col: 2, row: 2 });
    game.tick(0);
    game.tick(500);
    expect(game.state.enemies[0]!.hp).toBe(10);
    expect(kills).toEqual([]);
    game.tick(500);
    expect(shots).toHaveLength(3);
    expect(game.state.enemies).toEqual([]);
    expect(kills).toEqual([
      { enemy: expect.objectContaining({ id, kind: 'infantry', hp: 0, distance: 1.5 }), reward: 5 },
    ]);
    game.tick(500);
    expect(shots).toHaveLength(3);
  });

  it('when a tower kills its target, the next tower in the same tick retargets', () => {
    const game = newGame();
    const shots = recordShots(game);
    const first = game.spawnEnemy('infantry');
    const towerA = place(game, { col: 2, row: 2 });
    game.tick(0);
    game.tick(500); // first at 10 HP, distance 0.75
    const second = game.spawnEnemy('infantry');
    const towerB = place(game, { col: 1, row: 2 }); // both enemies in range of both towers
    game.tick(500);
    expect(shots.slice(2)).toEqual([
      [towerA, first],
      [towerB, second],
    ]);
    expect(game.state.enemies).toEqual([expect.objectContaining({ id: second, hp: 20 })]);
  });

  it('towerFired carries where the hit landed, so a tracer can be drawn to a target that just died', () => {
    const game = newGame();
    const hits: unknown[] = [];
    game.events.on('towerFired', (shot) => hits.push(shot));
    const enemy = game.spawnEnemy('infantry');
    const tower = place(game, { col: 2, row: 2 });
    game.tick(0);
    game.tick(500);
    game.tick(500); // the killing shot, at distance 1.5
    expect(hits.at(-1)).toEqual({
      towerId: tower,
      targetId: enemy,
      position: { x: 2, y: 1.5 },
      hits: [{ enemyId: enemy, damage: 10 }],
    });
  });

  it('towerFired and enemyKilled listeners see the settled state of the tick', () => {
    const game = newGame();
    const seen: string[] = [];
    game.events.on('towerFired', ({ targetId }) =>
      seen.push(`fired hp=${game.state.enemies.find((e) => e.id === targetId)?.hp ?? 'gone'}`),
    );
    game.events.on('enemyKilled', () => seen.push(`killed left=${game.state.enemies.length}`));
    game.spawnEnemy('infantry');
    place(game, { col: 2, row: 2 });
    game.tick(0);
    game.tick(500);
    game.tick(500);
    expect(seen).toEqual(['fired hp=20', 'fired hp=10', 'fired hp=gone', 'killed left=0']);
  });
});

// No data kind is ground-only, armored or airborne yet, so these build towers and enemies by hand.
// The tower stands on tile (2, 2), center (2.5, 2.5); enemies sit on y = 1.5, all within its 2.5 range.
const handTower = (stats: Partial<Tower> = {}): Tower => ({
  id: 1,
  kind: 'rifleNest',
  tile: { col: 2, row: 2 },
  cost: 50,
  range: 2.5,
  fireRate: 2,
  damage: 10,
  targets: ['ground', 'air'],
  cooldownMs: 0,
  level: 1,
  spent: 50,
  ...stats,
});

const handEnemy = (id: number, distance: number, stats: Partial<Enemy> = {}): Enemy => ({
  ...ENEMY_STATS.infantry,
  id,
  kind: 'infantry',
  hp: ENEMY_STATS.infantry.maxHp,
  distance,
  position: { x: 0.5 + distance, y: 1.5 },
  ...stats,
});

describe('layers', () => {
  it('a ground-only tower ignores a Helicopter in range', () => {
    const helicopter = handEnemy(1, 1, {
      ...ENEMY_STATS.helicopter,
      kind: 'helicopter',
      hp: ENEMY_STATS.helicopter.maxHp,
    });
    expect(selectTarget(handTower({ targets: ['ground'] }), [helicopter])).toBeUndefined();
    expect(selectTarget(handTower({ targets: ['ground', 'air'] }), [helicopter])?.id).toBe(1);
  });

  it('a ground-only tower ignores an air enemy further along and picks the ground one behind it', () => {
    const tower = handTower({ targets: ['ground'] });
    const enemies = [handEnemy(1, 1), handEnemy(2, 2, { layer: 'air' })];
    expect(selectTarget(tower, enemies)?.id).toBe(1);
  });

  it('a ground-only tower with only air enemies in range has no target', () => {
    const tower = handTower({ targets: ['ground'] });
    const enemies = [handEnemy(1, 1, { layer: 'air' }), handEnemy(2, 2, { layer: 'air' })];
    expect(selectTarget(tower, enemies)).toBeUndefined();
  });

  it('a tower that hits both layers picks "first" across both', () => {
    const tower = handTower({ targets: ['ground', 'air'] });
    expect(selectTarget(tower, [handEnemy(1, 1), handEnemy(2, 2, { layer: 'air' })])?.id).toBe(2);
    expect(selectTarget(tower, [handEnemy(1, 2), handEnemy(2, 1, { layer: 'air' })])?.id).toBe(1);
  });
});

describe('minimum range', () => {
  // A 1.5-tile dead zone around the center (2.5, 2.5); each enemy stands straight above it, `gap` tiles away.
  const tower = handTower({ range: 5, minRange: 1.5 });
  const above = (id: number, gap: number, distance: number) =>
    handEnemy(id, distance, { position: { x: 2.5, y: 2.5 - gap } });

  it('an enemy inside the minimum range is never picked, even when it is furthest along', () => {
    expect(selectTarget(tower, [above(1, 2, 1), above(2, 1, 5)])?.id).toBe(1);
  });

  it('an enemy exactly at the minimum range is not picked', () => {
    expect(selectTarget(tower, [above(1, 1.5, 1)])).toBeUndefined();
  });

  it('an enemy just past the minimum range is picked', () => {
    expect(selectTarget(tower, [above(1, 1.51, 1)])?.id).toBe(1);
  });

  it('with only enemies inside the minimum range, there is no target', () => {
    expect(selectTarget(tower, [above(1, 0, 1), above(2, 1, 2)])).toBeUndefined();
  });
});

describe('armor', () => {
  it("an armored enemy takes damage − armor per hit, and the shot's hit reports it", () => {
    const fired = fireTowers([handTower({ damage: 10 })], [handEnemy(7, 1, { armor: 3 })], 0);
    expect(fired.enemies).toEqual([expect.objectContaining({ id: 7, hp: 23 })]);
    expect(fired.shots).toEqual([
      { towerId: 1, targetId: 7, position: { x: 1.5, y: 1.5 }, hits: [{ enemyId: 7, damage: 7 }] },
    ]);
  });

  it('armor pierce cancels armor up to its value', () => {
    const fired = fireTowers([handTower({ damage: 10, armorPierce: 2 })], [handEnemy(7, 1, { armor: 3 })], 0);
    expect(fired.shots[0]!.hits).toEqual([{ enemyId: 7, damage: 9 }]);
  });

  it('a killing hit reports only the HP that was left', () => {
    const fired = fireTowers([handTower({ damage: 10 })], [handEnemy(7, 1, { hp: 4 })], 0);
    expect(fired.shots[0]!.hits).toEqual([{ enemyId: 7, damage: 4 }]);
    expect(fired.kills).toEqual([expect.objectContaining({ id: 7, hp: 0 })]);
    expect(fired.enemies).toEqual([]);
  });
});

describe('AA Gun', () => {
  const aaGun = (): Tower => ({
    ...TOWER_STATS.aaGun,
    id: 1,
    kind: 'aaGun',
    tile: { col: 2, row: 2 },
    cooldownMs: 0,
    level: 1,
    spent: 75,
  });
  const helicopter = (id: number, distance: number): Enemy =>
    handEnemy(id, distance, {
      ...ENEMY_STATS.helicopter,
      kind: 'helicopter',
      hp: ENEMY_STATS.helicopter.maxHp,
    });

  it('has the starting numbers from the spec', () => {
    expect(TOWER_STATS.aaGun).toEqual({ cost: 75, range: 3, fireRate: 4, damage: 8, targets: ['air', 'ground'] });
  });

  it('hits ground enemies too (ADR-0007: no hard counters)', () => {
    const result = fireTowers([aaGun()], [handEnemy(1, 1)], 0);
    expect(result.shots.map((s) => s.targetId)).toEqual([1]);
    expect(result.shots[0]?.hits).toEqual([{ enemyId: 1, damage: 8 }]);
  });

  it('does 3 damage per hit to an armor-5 enemy', () => {
    const result = fireTowers([aaGun()], [handEnemy(1, 1, { armor: 5 })], 0);
    expect(result.shots[0]?.hits).toEqual([{ enemyId: 1, damage: 3 }]);
  });

  it('shoots a Helicopter that is further along than a ground enemy', () => {
    const result = fireTowers([aaGun()], [handEnemy(2, 1), helicopter(1, 2)], 0);
    expect(result.shots.map((s) => s.targetId)).toEqual([1]);
  });
});

describe('towerAt', () => {
  it('finds the tower on a tile', () => {
    const game = newGame();
    place(game, { col: 2, row: 3 });
    const id = place(game, { col: 4, row: 1 });
    expect(towerAt(game.state.towers, { col: 4, row: 1 })?.id).toBe(id);
  });

  it('returns undefined for a tile with no tower', () => {
    const game = newGame();
    place(game, { col: 2, row: 3 });
    expect(towerAt(game.state.towers, { col: 3, row: 3 })).toBeUndefined();
  });
});
