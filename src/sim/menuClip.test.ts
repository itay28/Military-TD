import { describe, expect, it } from 'vitest';
import { mapById } from '../data/maps';
import { MENU_CLIP, type MenuClip } from '../data/menuClip';
import { TICK_MS, type GameEvents } from './game';
import type { MapData } from './map';
import { clipPanAt, clipTicks, createMenuClipGame, validateMenuClip, type MenuClipGame } from './menuClip';

// Right 5 tiles along row 1: an Infantry (1.5 tiles/s) walks it in about 3.5 s, a Jeep (3 tiles/s) in about 1.7 s.
const STRIP: MapData = {
  id: 'strip',
  cols: 6,
  rows: 4,
  waypoints: [
    { col: 0, row: 1 },
    { col: 5, row: 1 },
  ],
};

const SMALL: MenuClip = {
  mapId: 'strip',
  towers: [{ kind: 'rifleNest', tile: { col: 2, row: 2 }, level: 2 }],
  loopMs: 4000,
  spawnEveryMs: 1000,
  spawns: [
    { kind: 'infantry', dies: true },
    { kind: 'jeep', dies: false },
  ],
  survivorHpScale: 1000,
  warmUpMs: 8000,
  pan: { from: { x: 1, y: 1 }, to: { x: 5, y: 3 }, zoom: 1.5 },
  fps: 30,
};

const run = (game: MenuClipGame, ms: number) => {
  for (let i = 0; i < clipTicks(ms); i++) game.tick(TICK_MS);
};

describe('validateMenuClip', () => {
  it('accepts the shipped clip and a small one', () => {
    expect(() => validateMenuClip(MENU_CLIP)).not.toThrow();
    expect(() => validateMenuClip(SMALL)).not.toThrow();
  });

  it.each([
    ['a spawn period that does not divide the loop', { spawnEveryMs: 1500 }],
    ['a spawn cycle that does not divide the spawns in a loop', { spawns: [...SMALL.spawns, SMALL.spawns[0]!] }],
    ['a warm-up that is not whole loops', { warmUpMs: 6000 }],
    ['a frame that is not whole ticks', { fps: 25 }],
    ['no spawns', { spawns: [] }],
  ])('throws for %s', (_name, change) => {
    expect(() => validateMenuClip({ ...SMALL, ...change })).toThrow(RangeError);
  });
});

describe('createMenuClipGame', () => {
  it('places the towers at their levels and spawns round the cycle, one each period from the start', () => {
    const game = createMenuClipGame(SMALL, STRIP);
    expect(game.state.towers.map(({ kind, level }) => ({ kind, level }))).toEqual([{ kind: 'rifleNest', level: 2 }]);
    run(game, 10);
    expect(game.state.enemies.map((e) => e.kind)).toEqual(['infantry']);
    run(game, 1000);
    expect(game.state.enemies.map((e) => e.kind)).toEqual(['infantry', 'jeep']);
  });

  it('gives the enemies that drive off many times their HP, and the ones that die their own', () => {
    const game = createMenuClipGame({ ...SMALL, towers: [] }, STRIP);
    run(game, 1010);
    expect(game.state.enemies.map((e) => e.maxHp)).toEqual([30, 20_000]);
  });

  it('never ends: no waves to win, and Lives to spare for every leak', () => {
    const game = createMenuClipGame({ ...SMALL, towers: [] }, STRIP);
    run(game, 60_000);
    expect(game.state.phase).toBe('build');
  });
});

describe('the shipped clip', () => {
  const map = mapById(MENU_CLIP.mapId).data;
  const { loopMs, warmUpMs } = MENU_CLIP;
  const loopTicks = clipTicks(loopMs);

  /** The field rounded for comparing: enemy kinds and positions, tower headings and cooldowns. */
  const snapshot = (game: MenuClipGame) => ({
    enemies: game.state.enemies.map((e) => ({ kind: e.kind, distance: e.distance.toFixed(6), hp: e.hp === e.maxHp })),
    towers: game.state.towers.map((t) => ({ heading: t.heading.toFixed(6), cooldownMs: t.cooldownMs.toFixed(6) })),
    shells: game.state.shells.length,
  });

  /** Every shot, shell, landing and kill over one loop from `fromTick`, with its tick in the loop. */
  const eventsOver = (game: MenuClipGame, fromTick: number): string[] => {
    const seen: string[] = [];
    let tick = 0;
    const log = (type: keyof GameEvents, what: string) => seen.push(`${tick - fromTick} ${type} ${what}`);
    game.events.on('towerFired', ({ towerId }) => log('towerFired', String(towerId)));
    game.events.on('shellFired', ({ towerId }) => log('shellFired', String(towerId)));
    game.events.on('shellLanded', ({ hits }) => log('shellLanded', String(hits.length)));
    game.events.on('enemyKilled', ({ enemy }) => log('enemyKilled', enemy.kind));
    for (; tick < fromTick + loopTicks; tick++) {
      if (tick < fromTick) seen.length = 0;
      game.tick(TICK_MS);
    }
    return seen;
  };

  it('is in the same state one loop on, from the first frame', () => {
    const game = createMenuClipGame(MENU_CLIP, map);
    run(game, warmUpMs);
    const first = snapshot(game);
    run(game, loopMs);
    expect(snapshot(game)).toEqual(first);
  });

  it('shoots and kills the same, at the same moments, every loop (so the wrecks and fallen match too)', () => {
    const warm = clipTicks(warmUpMs);
    const once = eventsOver(createMenuClipGame(MENU_CLIP, map), warm);
    const twice = eventsOver(createMenuClipGame(MENU_CLIP, map), warm + loopTicks);
    expect(twice).toEqual(once);
    expect(once.some((e) => e.includes('towerFired'))).toBe(true);
  });

  it('kills exactly the enemies chosen to die, once each a loop, and keeps the road calm', () => {
    const game = createMenuClipGame(MENU_CLIP, map);
    run(game, warmUpMs);
    const killed: string[] = [];
    game.events.on('enemyKilled', ({ enemy }) => killed.push(enemy.kind));
    let most = 0;
    for (let i = 0; i < loopTicks; i++) {
      game.tick(TICK_MS);
      most = Math.max(most, game.state.enemies.length);
    }
    const chosen = MENU_CLIP.spawns.filter((s) => s.dies).map((s) => s.kind);
    const perLoop = (loopMs / MENU_CLIP.spawnEveryMs / MENU_CLIP.spawns.length) as number;
    expect(killed.sort()).toEqual(
      Array.from({ length: perLoop }, () => chosen)
        .flat()
        .sort(),
    );
    expect(most).toBeLessThanOrEqual(8);
  });
});

describe('clipPanAt', () => {
  it('starts at `from`, reaches `to` half a loop in, and is back at `from` after a loop', () => {
    expect(clipPanAt(SMALL, 0)).toEqual(SMALL.pan.from);
    expect(clipPanAt(SMALL, SMALL.loopMs / 2)).toEqual(SMALL.pan.to);
    const end = clipPanAt(SMALL, SMALL.loopMs);
    expect(end.x).toBeCloseTo(SMALL.pan.from.x, 9);
    expect(end.y).toBeCloseTo(SMALL.pan.from.y, 9);
  });
});
