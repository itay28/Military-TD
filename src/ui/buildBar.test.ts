// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import { TOWER_STATS } from '../data/towers';
import { buildOptions, mountBuildBar, type BuildOption } from './buildBar';

// Only the Rifle Nest exists today, so most tests use made-up kinds to have more than one.
const OPTIONS: readonly BuildOption<'rifle' | 'cannon' | 'mortar'>[] = [
  { kind: 'rifle', name: 'Rifle', cost: 50, icon: { fill: 0x112233, outline: 0xffffff } },
  { kind: 'cannon', name: 'Cannon', cost: 120, icon: { fill: 0x445566, outline: 0xffffff } },
  { kind: 'mortar', name: 'Mortar', cost: 200, icon: { fill: 0x778899, outline: 0xffffff } },
];

let root: HTMLElement;
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
const button = (kind: string) => root.querySelector<HTMLButtonElement>(`[data-testid="build-${kind}"]`)!;
const pressed = () => buttons().filter((b) => b.getAttribute('aria-pressed') === 'true');
const pressKey = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
/** A game whose Money a test can change. */
const wallet = (money: number) => ({ state: { money } });

beforeEach(() => {
  document.body.innerHTML = '<div id="build-bar"></div>';
  root = document.getElementById('build-bar')!;
});

describe('buildOptions', () => {
  it('has every tower kind, in TOWER_STATS order, with its name, cost and colours', () => {
    expect(buildOptions()).toEqual(
      Object.entries(TOWER_STATS).map(([kind, stats]) => ({
        kind,
        name: TOWER_NAMES[kind as keyof typeof TOWER_STATS],
        cost: stats.cost,
        icon: {
          fill: TOWER_STYLE[kind as keyof typeof TOWER_STATS].fill,
          outline: TOWER_STYLE[kind as keyof typeof TOWER_STATS].outline,
        },
      })),
    );
    expect(buildOptions()[0]).toMatchObject({ kind: 'rifleNest', name: 'Rifle Nest', cost: 50 });
  });
});

describe('Build bar', () => {
  it('lists every kind with its name, cost and hotkey, in a two-column grid', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    expect(buttons().map((b) => b.dataset.testid)).toEqual(['build-rifle', 'build-cannon', 'build-mortar']);
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['Rifle', 'Cannon', 'Mortar']);
    expect(button('cannon').title).toBe('Cannon (2): 120');
    expect(button('cannon').textContent).toContain('120');
    expect(button('cannon').querySelector('kbd')?.textContent).toBe('2');
    const grid = root.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe(`repeat(${BUILD_BAR_COLUMNS}, 1fr)`);
    expect(BUILD_BAR_COLUMNS).toBe(2);
  });

  it('draws each icon in its kind colours', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    const icon = button('cannon').querySelector<HTMLElement>('.build-icon')!;
    expect(icon.style.backgroundColor).toMatch(/#445566|rgb\(68, 85, 102\)/);
    expect(icon.style.borderColor).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
  });

  it('selects the first kind at the start', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    expect(bar.selected).toBe('rifle');
    expect(pressed()).toEqual([button('rifle')]);
  });

  it('a click selects that kind', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    button('mortar').click();
    expect(bar.selected).toBe('mortar');
    expect(pressed()).toEqual([button('mortar')]);
  });

  it('a number key selects the kind with that hotkey', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    pressKey('2');
    expect(bar.selected).toBe('cannon');
    expect(pressed()).toEqual([button('cannon')]);
  });

  it('ignores keys with no kind, and keys held with Ctrl, Alt or Meta', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    pressKey('9');
    pressKey('0');
    pressKey('a');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true }));
    expect(bar.selected).toBe('rifle');
  });

  it('disables kinds the player cannot afford, and enables them when Money arrives', () => {
    const game = wallet(100);
    const bar = mountBuildBar(root, game, OPTIONS);
    expect(buttons().map((b) => b.disabled)).toEqual([false, true, true]);
    game.state.money = 120;
    bar.update();
    expect(buttons().map((b) => b.disabled)).toEqual([false, false, true]);
  });

  it('an unaffordable kind cannot be selected by click or key', () => {
    const bar = mountBuildBar(root, wallet(100), OPTIONS);
    button('cannon').click();
    pressKey('3');
    expect(bar.selected).toBe('rifle');
  });

  it('a selected kind that becomes unaffordable stays selected', () => {
    const game = wallet(500);
    const bar = mountBuildBar(root, game, OPTIONS);
    button('mortar').click();
    game.state.money = 10;
    bar.update();
    expect(bar.selected).toBe('mortar');
    expect(button('mortar').disabled).toBe(true);
    expect(pressed()).toEqual([button('mortar')]);
  });

  it('destroy() removes the bar and stops listening for hotkeys', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    bar.destroy();
    expect(root.children).toHaveLength(0);
    pressKey('2');
    expect(bar.selected).toBe('rifle');
  });
});
