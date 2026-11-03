// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import { renderFor } from '../data/renders';
import { towerIcon } from '../data/sprites';
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
        ...(kind === 'aaGun'
          ? { render: expect.objectContaining({ hullUrl: renderFor('aaGun')!.hullUrl }) }
          : { sprite: towerIcon(kind as keyof typeof TOWER_STATS) }),
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
    const options = buildOptions(() => false); // shapes only: a render icon has none
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

describe('Build bar sprite icons', () => {
  const atlas = {
    url: 'atlas.png',
    frame: (name: string) => (name === 'missing' ? null : { x: 10, y: 20, w: 64, h: 64 }),
  };
  const sprite = { base: 'baseFrame', turret: 'turretFrame', turretRotation: -Math.PI / 2 };
  const iconOf = (kind: string) => button(kind).querySelector<HTMLElement>('.build-icon')!;

  it('draws a kind with a sprite as its base and turret layers from the atlas, with no shape fill', () => {
    mountBuildBar(root, wallet(500), [{ ...OPTIONS[0]!, sprite }, OPTIONS[1]!], { atlas });
    const layers = iconOf('rifle').querySelectorAll<HTMLElement>('.build-icon-layer');
    expect(layers).toHaveLength(2);
    expect(layers[0]!.style.backgroundImage).toContain('atlas.png');
    expect(layers[0]!.style.backgroundPosition).toBe('-10px -20px');
    expect(layers[1]!.style.transform).toContain('rotate(-90deg)');
    expect(iconOf('rifle').style.backgroundColor).toBe('');
  });

  it('keeps the shape for a kind whose sprite frame is missing', () => {
    mountBuildBar(root, wallet(500), [{ ...OPTIONS[1]!, sprite: { ...sprite, turret: 'missing' } }], { atlas });
    const icon = iconOf('cannon');
    expect(icon.querySelector('.build-icon-layer')).toBeNull();
    expect(icon.style.backgroundColor).not.toBe('');
  });

  it('keeps the shape for a kind without a sprite', () => {
    mountBuildBar(root, wallet(500), [OPTIONS[2]!], { atlas });
    expect(iconOf('mortar').querySelector('.build-icon-layer')).toBeNull();
    expect(iconOf('mortar').style.backgroundColor).not.toBe('');
  });

  it('keeps the shape when there is no atlas', () => {
    mountBuildBar(root, wallet(500), [{ ...OPTIONS[0]!, sprite }]);
    expect(iconOf('rifle').querySelector('.build-icon-layer')).toBeNull();
    expect(iconOf('rifle').style.backgroundColor).not.toBe('');
  });

  it('scales a smaller tower’s sprite layers to its smaller icon', () => {
    mountBuildBar(
      root,
      wallet(500),
      [
        { ...OPTIONS[0]!, sprite },
        { ...OPTIONS[1]!, sprite },
      ],
      { atlas },
    );
    const scale = (kind: string) =>
      Number(
        /scale\(([\d.]+)\)/.exec(iconOf(kind).querySelector<HTMLElement>('.build-icon-layer')!.style.transform)![1],
      );
    const ratio = parseFloat(iconOf('rifle').style.width) / parseFloat(iconOf('cannon').style.width);
    expect(scale('rifle') / scale('cannon')).toBeCloseTo(ratio);
  });

  it('buildOptions gives each kind with a sprite its icon layers', () => {
    expect(buildOptions().find((o) => o.kind === 'cannon')!.sprite).toMatchObject({ turretRotation: 0 });
  });
});

describe('Build bar render icons', () => {
  const render = { hullUrl: 'hull.png', turretUrl: 'turret.png', canvasPx: 160 };
  const iconOf = (kind: string) => button(kind).querySelector<HTMLElement>('.build-icon')!;

  it('buildOptions gives a kind with a render its images and no Kenney sprite; others keep Kenney', () => {
    const options = buildOptions();
    const aa = options.find((o) => o.kind === 'aaGun')!;
    expect(aa.render).toEqual({
      hullUrl: renderFor('aaGun')!.hullUrl,
      turretUrl: renderFor('aaGun')!.turretUrl,
      canvasPx: renderFor('aaGun')!.canvasPx,
    });
    expect(aa.sprite).toBeUndefined();
    const cannon = options.find((o) => o.kind === 'cannon')!;
    expect(cannon.render).toBeUndefined();
    expect(cannon.sprite).toBeDefined();
  });

  it('falls back to the Kenney sprite when the render did not load', () => {
    const aa = buildOptions(() => false).find((o) => o.kind === 'aaGun')!;
    expect(aa.render).toBeUndefined();
    expect(aa.sprite).toEqual(towerIcon('aaGun'));
  });

  it('draws hull then turret from the render images, scaled to the box, needing no atlas', () => {
    mountBuildBar(root, wallet(500), [{ ...OPTIONS[0]!, render }]);
    const layers = iconOf('rifle').querySelectorAll<HTMLElement>('.build-icon-layer');
    expect(layers).toHaveLength(2);
    expect(layers[0]!.style.backgroundImage).toContain('hull.png');
    expect(layers[1]!.style.backgroundImage).toContain('turret.png');
    expect(layers[1]!.style.transform).toContain(`scale(${24 / 160})`);
    expect(layers[1]!.style.transform).not.toContain('rotate');
    expect(iconOf('rifle').style.backgroundColor).toBe('');
  });
});

describe('mountBuildBar onSelect and clear', () => {
  it('calls onSelect when a click or a hotkey selects a kind, not when one is cleared', () => {
    let calls = 0;
    const bar = mountBuildBar(root, wallet(500), OPTIONS, { onSelect: () => calls++ });
    button('rifle').click();
    pressKey('2');
    expect(calls).toBe(2);
    button('cannon').click(); // clears
    expect(bar.selected).toBeUndefined();
    expect(calls).toBe(2);
  });

  it('does not call onSelect for a kind the player cannot afford', () => {
    let calls = 0;
    mountBuildBar(root, wallet(10), OPTIONS, { onSelect: () => calls++ });
    pressKey('1');
    expect(calls).toBe(0);
  });

  it('clear() drops the selection and unpresses the button', () => {
    const bar = mountBuildBar(root, wallet(500), OPTIONS);
    button('rifle').click();
    bar.clear();
    expect(bar.selected).toBeUndefined();
    expect(pressed()).toHaveLength(0);
  });
});

describe('Build bar tooltips', () => {
  const tooltip = (name: string) => ({ name, role: `${name} role`, rows: [{ label: 'Cost', value: '1' }] });
  const TIPPED = OPTIONS.map((option) => ({ ...option, tooltip: tooltip(option.name) }));
  const tip = (kind: string) => root.querySelector<HTMLElement>(`[data-testid="build-tip-${kind}"]`)!;
  const shown = () =>
    [...root.querySelectorAll<HTMLElement>('[role="tooltip"]')].filter((el) => !el.hidden).map((el) => el.dataset.testid);
  const enter = (kind: string) => button(kind).dispatchEvent(new Event('pointerenter'));
  const leave = (kind: string) => button(kind).dispatchEvent(new Event('pointerleave'));

  it('gives every kind from buildOptions a tooltip', () => {
    for (const option of buildOptions()) expect(option.tooltip?.name).toBe(option.name);
  });

  it("points each button's aria-describedby at its tooltip, which lists the name, role and rows", () => {
    mountBuildBar(root, wallet(500), TIPPED);
    for (const { kind, name } of TIPPED) {
      const id = button(kind).getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      const el = document.getElementById(id!)!;
      expect(el.getAttribute('role')).toBe('tooltip');
      expect(el.textContent).toContain(name);
      expect(el.textContent).toContain(`${name} role`);
      expect(el.textContent).toContain('Cost');
    }
    // The tooltip replaces the native title, so two never show at once.
    expect(button('cannon').title).toBe('');
  });

  it('names the hotkey in the tooltip', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    expect(tip('cannon').textContent).toContain('[2]');
  });

  it('starts with every tooltip hidden', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    expect(shown()).toEqual([]);
  });

  it('shows on hover and hides when the pointer leaves', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    enter('cannon');
    expect(shown()).toEqual(['build-tip-cannon']);
    leave('cannon');
    expect(shown()).toEqual([]);
  });

  it('shows on keyboard focus and hides on blur', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    button('mortar').dispatchEvent(new FocusEvent('focus'));
    expect(shown()).toEqual(['build-tip-mortar']);
    button('mortar').dispatchEvent(new FocusEvent('blur'));
    expect(shown()).toEqual([]);
  });

  it('shows while a kind is selected (touch has no hover) and hides on clear or Escape', () => {
    const bar = mountBuildBar(root, wallet(500), TIPPED);
    pressKey('1');
    expect(shown()).toEqual(['build-tip-rifle']);
    pressKey('Escape');
    expect(shown()).toEqual([]);
    button('cannon').click();
    expect(shown()).toEqual(['build-tip-cannon']);
    bar.clear();
    expect(shown()).toEqual([]);
  });

  it('shows one at a time: the hovered one wins over the selected one', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    pressKey('1');
    enter('mortar');
    expect(shown()).toEqual(['build-tip-mortar']);
    leave('mortar');
    expect(shown()).toEqual(['build-tip-rifle']);
  });

  it('hides once the bar is collapsed', () => {
    mountBuildBar(root, wallet(500), TIPPED);
    pressKey('1');
    toggle().click();
    expect(shown()).toEqual([]);
  });

  it('takes the tile to keep clear with avoid(), and still works without one', () => {
    const bar = mountBuildBar(root, wallet(500), TIPPED);
    pressKey('1');
    bar.avoid({ left: 0, top: 0, width: 10, height: 10 });
    bar.avoid(undefined);
    expect(shown()).toEqual(['build-tip-rifle']);
  });

  it('keeps the native title for an option without a tooltip', () => {
    mountBuildBar(root, wallet(500), OPTIONS);
    expect(button('cannon').getAttribute('aria-describedby')).toBeNull();
    expect(root.querySelector('[role="tooltip"]')).toBeNull();
  });
});
