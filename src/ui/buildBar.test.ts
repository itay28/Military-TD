// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import { TOWER_STATS } from '../data/towers';
import { buildOptions, mountBuildBar, type BuildOption } from './buildBar';

// Only the Rifle Nest exists today, so most tests use made-up kinds to have more than one.
const OPTIONS: readonly BuildOption<'rifle' | 'cannon' | 'mortar'>[] = [
  { kind: 'rifle', name: 'Rifle', cost: 50, icon: { fill: 0x112233, outline: 0xffffff, shape: 'square', size: 32 } },
  { kind: 'cannon', name: 'Cannon', cost: 120, icon: { fill: 0x445566, outline: 0xffffff, shape: 'square', size: 36 } },
  { kind: 'mortar', name: 'Mortar', cost: 200, icon: { fill: 0x778899, outline: 0xffffff, shape: 'circle', size: 18 } },
];

let root: HTMLElement;
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.build-grid button')];
const toggle = () => root.querySelector<HTMLButtonElement>('[data-testid="build-bar-toggle"]')!;
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
          shape: TOWER_STYLE[kind as keyof typeof TOWER_STATS].shape,
          size: TOWER_STYLE[kind as keyof typeof TOWER_STATS].size,
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
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['Rifle (50)', 'Cannon (120)', 'Mortar (200)']);
    expect(button('cannon').title).toBe('Cannon (2): 120');
    expect(button('cannon').textContent).toContain('120');
    expect(button('cannon').querySelector('kbd')?.textContent).toBe('2');
    const grid = root.querySelector<HTMLElement>('.build-grid')!;
    expect(grid.style.gridTemplateColumns).toBe(`repeat(${BUILD_BAR_COLUMNS}, 1fr)`);
    expect(BUILD_BAR_COLUMNS).toBe(2);
  });

  it('draws each icon in its kind colours', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    const icon = button('cannon').querySelector<HTMLElement>('.build-icon')!;
    expect(icon.style.backgroundColor).toMatch(/#445566|rgb\(68, 85, 102\)/);
    expect(icon.style.borderColor).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
  });

  it('draws round icons for circle kinds and square ones for square kinds', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    const radius = (kind: string) => button(kind).querySelector<HTMLElement>('.build-icon')!.style.borderRadius;
    expect(radius('rifle')).toBe('');
    expect(radius('mortar')).toBe('50%');
  });

  it('matches every kind icon shape to TOWER_STYLE, so a new kind cannot drift', () => {
    const options = buildOptions();
    mountBuildBar(root, wallet(500), options);
    for (const { kind } of options) {
      const icon = button(kind).querySelector<HTMLElement>('.build-icon')!;
      expect(icon.style.borderRadius === '50%', kind).toBe(TOWER_STYLE[kind].shape === 'circle');
    }
  });

  it('keeps icon sizes relative: the largest fills the box, smaller towers are scaled down', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    const width = (kind: string) => parseFloat(button(kind).querySelector<HTMLElement>('.build-icon')!.style.width);
    expect(width('cannon')).toBe(24);
    expect(width('rifle')).toBeCloseTo((24 * 32) / 36);
    expect(width('mortar')).toBeCloseTo(12);
    expect(button('cannon').querySelector<HTMLElement>('.build-icon')!.style.height).toBe('24px');
  });

  it('selects no kind at the start, so a click on the map builds nothing until the player picks one', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    expect(bar.selected).toBeUndefined();
    expect(pressed()).toEqual([]);
  });

  it('a click on the selected kind clears the selection', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    button('cannon').click();
    button('cannon').click();
    expect(bar.selected).toBeUndefined();
    expect(pressed()).toEqual([]);
  });

  it('Escape clears the selection', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    pressKey('1');
    pressKey('Escape');
    expect(bar.selected).toBeUndefined();
  });

  it('marks an Escape that clears a selection as handled, so it does not also pause', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    const escape = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const idle = escape();
    document.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    pressKey('1');
    const clearing = escape();
    document.dispatchEvent(clearing);
    expect(clearing.defaultPrevented).toBe(true);
  });

  it('the toggle collapses the bar and expands it again', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    expect(bar.collapsed).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    expect(bar.collapsed).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector<HTMLElement>('.build-grid')!.hidden).toBe(true);
    expect(root.dataset.collapsed).toBe('true');
    toggle().click();
    expect(bar.collapsed).toBe(false);
    expect(root.querySelector<HTMLElement>('.build-grid')!.hidden).toBe(false);
    expect(root.dataset.collapsed).toBe('false');
  });

  it('collapsing keeps the selected kind', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    pressKey('2');
    toggle().click();
    expect(bar.selected).toBe('cannon');
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
    expect(bar.selected).toBeUndefined();
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
    button('rifle').click();
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
    expect(pressed()).toEqual([button('mortar')]);
  });

  it('keeps a selected kind that becomes unaffordable clickable, marked unaffordable by aria-disabled', () => {
    const game = wallet(500);
    const bar = mountBuildBar(root, game, OPTIONS);
    button('mortar').click();
    game.state.money = 10;
    bar.update();
    expect(button('mortar').disabled).toBe(false);
    expect(button('mortar').getAttribute('aria-disabled')).toBe('true');
    expect(button('cannon').disabled).toBe(true);
  });

  it('a click on a selected kind that became unaffordable clears the selection, and disables it', () => {
    const game = wallet(500);
    const bar = mountBuildBar(root, game, OPTIONS);
    button('cannon').click();
    game.state.money = 10;
    bar.update();
    button('cannon').click();
    expect(bar.selected).toBeUndefined();
    expect(pressed()).toEqual([]);
    expect(button('cannon').disabled).toBe(true);
  });

  it('marks only unaffordable kinds aria-disabled, and clears it when Money arrives', () => {
    const game = wallet(100);
    const bar = mountBuildBar(root, game, OPTIONS);
    expect(buttons().map((b) => b.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true']);
    game.state.money = 120;
    bar.update();
    expect(buttons().map((b) => b.getAttribute('aria-disabled'))).toEqual([null, null, 'true']);
  });

  it('destroy() removes the bar and stops listening for hotkeys', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    bar.destroy();
    expect(root.children).toHaveLength(0);
    pressKey('2');
    expect(bar.selected).toBeUndefined();
  });
});
