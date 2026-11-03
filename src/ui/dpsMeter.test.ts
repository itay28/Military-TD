// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { DPS_METER_REFRESH_MS } from '../data/display';
import { addTower, addWaveTime, emptyStats, endWave, recordShots, resetWave, withWaveElapsed } from '../sim/stats';
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
  stats = recordShots(stats, [shot(1, 10, 40), shot(2, 11, 100), shot(3, 12, 20)], new Set([10]));
  return endWave(withWaveElapsed(addWaveTime(stats, [1, 2, 3], 4000), 4000), 1);
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
    let stats = resetWave(game.state.stats);
    stats = withWaveElapsed(recordShots(stats, [shot(3, 13, 10)], new Set()), 1000);
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

  describe('clicking rows (#244)', () => {
    const kindButton = (kind: string) => q<HTMLButtonElement>(`dps-kind-highlight-${kind}`)!;
    const towerButton = (id: number) => q<HTMLButtonElement>(`dps-tower-button-${id}`)!;
    const mountWith = (game = fakeGame(wave1())) => {
      const calls = { selected: [] as number[], highlighted: [] as (string | undefined)[] };
      const meter = mountDpsMeter(root, game, {
        now,
        narrow: () => false,
        onSelectTower: (id) => calls.selected.push(id),
        onHighlightKind: (kind) => calls.highlighted.push(kind),
      });
      meter.toggle();
      return { meter, calls };
    };

    it('names the buttons and starts with nothing highlighted', () => {
      const { meter } = mountWith();
      expect(kindButton('cannon').getAttribute('aria-label')).toBe('Highlight all Cannons');
      expect(kindButton('rifleNest').getAttribute('aria-label')).toBe('Highlight all Rifle Nests');
      expect(kindButton('cannon').getAttribute('aria-pressed')).toBe('false');
      expect(towerButton(2).getAttribute('aria-label')).toBe('Select Cannon #2');
      expect(towerButton(3).getAttribute('aria-label')).toBe('Select Rifle Nest #3');
      expect(meter.highlightedKind).toBeUndefined();
    });

    it('highlights a kind on click and clears it on a second click', () => {
      const { meter, calls } = mountWith();
      kindButton('cannon').click();
      expect(meter.highlightedKind).toBe('cannon');
      expect(kindButton('cannon').getAttribute('aria-pressed')).toBe('true');
      kindButton('cannon').click();
      expect(meter.highlightedKind).toBeUndefined();
      expect(kindButton('cannon').getAttribute('aria-pressed')).toBe('false');
      expect(calls.highlighted).toEqual(['cannon', undefined]);
    });

    it('highlights one kind at a time', () => {
      const { meter, calls } = mountWith();
      kindButton('cannon').click();
      kindButton('rifleNest').click();
      expect(meter.highlightedKind).toBe('rifleNest');
      expect(kindButton('cannon').getAttribute('aria-pressed')).toBe('false');
      expect(kindButton('rifleNest').getAttribute('aria-pressed')).toBe('true');
      expect(calls.highlighted).toEqual(['cannon', 'rifleNest']);
    });

    it('clears the highlight on Escape, and ignores other keys', () => {
      const { meter, calls } = mountWith();
      kindButton('cannon').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(meter.highlightedKind).toBe('cannon');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      expect(meter.highlightedKind).toBeUndefined();
      expect(kindButton('cannon').getAttribute('aria-pressed')).toBe('false');
      expect(calls.highlighted).toEqual(['cannon', undefined]);
    });

    it('lets Escape reach other handlers when nothing is highlighted', () => {
      mountWith();
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('selects the tower of a tower row', () => {
      const { calls } = mountWith();
      towerButton(2).click();
      towerButton(3).click();
      expect(calls.selected).toEqual([2, 3]);
    });

    it('does not let a sold tower be selected', () => {
      const game = fakeGame(wave1());
      game.state = { ...game.state, towers: game.state.towers.filter((t) => t.id !== 3) };
      const { calls } = mountWith(game);
      expect(towerButton(3).disabled).toBe(true);
      expect(towerButton(1).disabled).toBe(false);
      towerButton(3).click();
      expect(calls.selected).toEqual([]);
    });

    it('clears the highlight when its kind leaves the meter', () => {
      const game = fakeGame(wave1());
      const { meter, calls } = mountWith(game);
      kindButton('cannon').click();
      game.state = { ...game.state, stats: emptyStats(), towers: [] };
      clock += DPS_METER_REFRESH_MS;
      meter.update();
      expect(meter.highlightedKind).toBeUndefined();
      expect(calls.highlighted).toEqual(['cannon', undefined]);
    });

    it('clears the highlight when the meter is closed', () => {
      const { meter, calls } = mountWith();
      kindButton('cannon').click();
      meter.toggle();
      expect(meter.highlightedKind).toBeUndefined();
      expect(calls.highlighted).toEqual(['cannon', undefined]);
    });

    it('clears the highlight when destroyed', () => {
      const { meter, calls } = mountWith();
      kindButton('cannon').click();
      meter.destroy();
      expect(calls.highlighted).toEqual(['cannon', undefined]);
    });

    it('keeps the expand button apart from the highlight button', () => {
      const { meter, calls } = mountWith();
      q<HTMLButtonElement>('dps-kind-toggle-cannon')!.click();
      expect(meter.highlightedKind).toBeUndefined();
      expect(calls.highlighted).toEqual([]);
    });
  });

  it('removes its element on destroy', () => {
    mount().destroy();
    expect(q('dps-meter')).toBeNull();
  });
});
