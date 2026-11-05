// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { DPS_METER_REFRESH_MS } from '../data/display';
import { addTower, addWaveTime, emptyStats, endWave, recordShots, startWaveStats, withWaveElapsed } from '../sim/stats';
import type { CombatStats } from '../sim/stats';
import type { Shot } from '../sim/towers';
import { mountDpsMeter, type DpsMeterGame } from './dpsMeter';

const shot = (towerId: number, enemyId: number, damage: number): Shot => ({
  towerId,
  targetId: enemyId,
  position: { x: 0, y: 0 },
  hits: [{ enemyId, damage }],
});
const tile = { col: 0, row: 0 };

// Wave 1 (4 s): Rifle Nest 1 deals 40 and kills, Cannon 2 deals 100, Rifle Nest 3 deals 20.
function wave1(): CombatStats {
  let stats = addTower(addTower(addTower(emptyStats(), 1, 'rifleNest', tile), 2, 'cannon', tile), 3, 'rifleNest', tile);
  stats = recordShots(
    startWaveStats(stats, 1),
    [shot(1, 10, 40), shot(2, 11, 100), shot(3, 12, 20)],
    new Set([10]),
    () => 1,
  );
  return endWave(withWaveElapsed(addWaveTime(stats, [1, 2, 3], 4000), new Map([[1, 4000]]), 1), 1);
}

/** A game the test drives by hand: the meter only reads `state`. */
const fakeGame = (stats: CombatStats, phase: DpsMeterGame['state']['phase'] = 'build') => ({
  state: {
    stats,
    phase,
    towers: [
      { id: 1, level: 1 },
      { id: 2, level: 2 },
      { id: 3, level: 1 },
    ],
  },
});

let root: HTMLElement;
let clock: number;
const now = () => clock;
const q = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
const text = (id: string) => q(id)?.textContent;
const kindOrder = () => [...root.querySelectorAll<HTMLElement>('[data-kind]')].map((el) => el.dataset.kind);
const towerOrder = (kind: string) =>
  [...q(`dps-kind-${kind}`)!.querySelectorAll<HTMLElement>('[data-tower-id]')].map((el) => el.dataset.towerId);

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
  root = document.getElementById('hud')!;
  clock = 0;
});

const mount = (game = fakeGame(wave1()), narrow = false) => mountDpsMeter(root, game, { now, narrow: () => narrow });

describe('DPS meter', () => {
  it('starts closed, and opens and closes', () => {
    const meter = mount();
    expect(q('dps-meter')?.hidden).toBe(true);
    meter.toggle();
    expect(meter.open).toBe(true);
    expect(q('dps-meter')?.hidden).toBe(false);
    meter.toggle();
    expect(q('dps-meter')?.hidden).toBe(true);
  });

  it('lists the kinds by DPS with name, DPS, kills, share and a bar sized by share', () => {
    mount().toggle();
    expect(kindOrder()).toEqual(['cannon', 'rifleNest']);
    expect(text('dps-kind-name-cannon')).toBe('Cannon');
    expect(text('dps-kind-dps-cannon')).toBe('25 DPS');
    expect(text('dps-kind-kills-rifleNest')).toBe('1 kill');
    expect(text('dps-kind-kills-cannon')).toBe('0 kills');
    expect(text('dps-kind-share-cannon')).toBe('63%');
    expect(q('dps-kind-bar-cannon')?.style.width).toBe('62.5%');
    expect(q('dps-kind-bar-rifleNest')?.style.width).toBe('37.5%');
  });

  it('gives each kind a swatch in its map colours and shape', () => {
    mount().toggle();
    const swatch = q('dps-kind-swatch-rifleNest')!;
    expect(swatch.dataset.shape).toBe('square');
    expect(swatch.style.backgroundColor).toBe('#3b4252');
    expect(q('dps-kind-swatch-aaGun')).toBeNull();
  });

  it('lists each kind’s towers by DPS, with id, level, DPS and kills', () => {
    mount().toggle();
    expect(towerOrder('rifleNest')).toEqual(['1', '3']);
    expect(text('dps-tower-1')).toBe('#1 Lv 1 · 10 DPS · 1 kill');
    expect(text('dps-tower-2')).toBe('#2 Lv 2 · 25 DPS · 0 kills');
  });

  it('marks a sold tower that dealt damage', () => {
    const game = fakeGame(wave1());
    game.state.towers = game.state.towers.filter((t) => t.id !== 1);
    mountDpsMeter(root, game, { now, narrow: () => false }).toggle();
    expect(text('dps-tower-1')).toBe('#1 sold · 10 DPS · 1 kill');
  });

  it('expands and collapses a kind; kinds start expanded on wide screens', () => {
    mount().toggle();
    const toggle = q<HTMLButtonElement>('dps-kind-toggle-cannon')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(q('dps-towers-cannon')?.hidden).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(q('dps-towers-cannon')?.hidden).toBe(true);
    toggle.click();
    expect(q('dps-towers-cannon')?.hidden).toBe(false);
  });

  it('starts kinds collapsed on narrow screens', () => {
    mount(fakeGame(wave1()), true).toggle();
    expect(q('dps-kind-toggle-cannon')?.getAttribute('aria-expanded')).toBe('false');
    expect(q('dps-towers-cannon')?.hidden).toBe(true);
  });

  it('switches between this wave and the whole game', () => {
    const game = fakeGame(wave1());
    const meter = mountDpsMeter(root, game, { now, narrow: () => false });
    meter.toggle();
    // Wave 2 (1 s so far): only Rifle Nest 3 has fired.
    let stats = startWaveStats(game.state.stats, 2);
    stats = withWaveElapsed(
      addWaveTime(
        recordShots(stats, [shot(3, 13, 10)], new Set(), () => 2),
        [3],
        1000,
      ),
      new Map([[2, 1000]]),
      2,
    );
    game.state = { ...game.state, stats, phase: 'wave' };
    clock += DPS_METER_REFRESH_MS;
    meter.update();
    expect(q('dps-scope-wave')?.getAttribute('aria-pressed')).toBe('true');
    expect(text('dps-kind-dps-rifleNest')).toBe('10 DPS');
    expect(text('dps-kind-share-rifleNest')).toBe('100%');
    q('dps-scope-total')!.click();
    expect(q('dps-scope-total')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('dps-scope-wave')?.getAttribute('aria-pressed')).toBe('false');
    // 170 damage over 5 s; Rifle Nests 70 of it.
    expect(kindOrder()).toEqual(['cannon', 'rifleNest']);
    expect(text('dps-kind-dps-rifleNest')).toBe('14 DPS');
    expect(text('dps-kind-share-rifleNest')).toBe('41%');
  });

  it('keeps the last wave’s figures between waves', () => {
    const game = fakeGame(wave1());
    const meter = mountDpsMeter(root, game, { now, narrow: () => false });
    meter.toggle();
    clock += 10_000;
    meter.update();
    expect(text('dps-kind-dps-cannon')).toBe('25 DPS');
  });

  it('says so when no tower is placed', () => {
    mountDpsMeter(root, { state: { stats: emptyStats(), phase: 'build', towers: [] } }, { now }).toggle();
    expect(text('dps-empty')).toBe('No towers yet');
    expect(q('dps-empty')?.hidden).toBe(false);
  });

  it('refreshes at most every DPS_METER_REFRESH_MS, writing only what changed', async () => {
    const game = fakeGame(wave1());
    const meter = mountDpsMeter(root, game, { now, narrow: () => false });
    meter.toggle();
    game.state = { ...game.state, stats: recordShots(game.state.stats, [shot(1, 20, 400)], new Set()) };
    clock += DPS_METER_REFRESH_MS - 1;
    meter.update();
    expect(text('dps-tower-1')).toBe('#1 Lv 1 · 10 DPS · 1 kill');
    clock += 1;
    meter.update();
    expect(text('dps-tower-1')).toBe('#1 Lv 1 · 110 DPS · 1 kill');
    const writes: MutationRecord[] = [];
    new MutationObserver((records) => writes.push(...records)).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    clock += DPS_METER_REFRESH_MS;
    meter.update();
    await Promise.resolve();
    expect(writes).toEqual([]);
  });

  it('does no work while closed', () => {
    const game = fakeGame(wave1());
    const meter = mountDpsMeter(root, game, { now, narrow: () => false });
    meter.update();
    expect(root.querySelectorAll('[data-kind]')).toHaveLength(0);
  });

  it('removes its element on destroy', () => {
    mount().destroy();
    expect(q('dps-meter')).toBeNull();
  });
});
