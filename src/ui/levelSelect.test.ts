// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAPS, type MapEntry } from '../data/maps';
import { mountLevelSelect, type LevelSelectOptions } from './levelSelect';

let app: HTMLElement;
let root: HTMLElement;
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
/** A button by its accessible name: a map's `aria-label`, or Back's text. */
const button = (name: string) =>
  buttons().find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name);
/** A map's button by the map name its accessible name starts with. */
const mapButton = (name: string) => buttons().find((b) => b.getAttribute('aria-label')?.startsWith(`${name},`));
const shown = (b: HTMLElement | undefined, testid: string) => b?.querySelector(`[data-testid="${testid}"]`);

const TWO_MAPS: readonly MapEntry[] = [
  MAPS[0]!,
  { id: 'second', name: 'Second Map', data: { ...MAPS[0]!.data, id: 'second' } },
];

function mount(options: Partial<LevelSelectOptions> = {}) {
  return mountLevelSelect(root, { app, maps: MAPS, onPick: () => {}, onBack: () => {}, ...options });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="level-select" hidden></div>';
  app = document.getElementById('app')!;
  root = document.getElementById('level-select')!;
});

describe('Level select', () => {
  it('shows a heading, one button per map named after it, and Back', () => {
    mount({ maps: TWO_MAPS });
    expect(root.hidden).toBe(false);
    expect(root.querySelector('h1')?.textContent).toBe('Select map');
    expect(buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      'Training Ground, no stars yet',
      'Second Map, no stars yet',
      'Back',
    ]);
    expect(buttons().every((b) => b.type === 'button')).toBe(true);
  });

  it('gives each map a preview canvas, hidden from screen readers so the name is the button’s name', () => {
    mount();
    const canvas = mapButton(MAPS[0]!.name)?.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.width).toBeGreaterThan(0);
  });

  it('calls onPick with the map id when the player picks a map', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick });
    mapButton('Second Map')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('second');
  });

  it('shows an unlocked map with no stars as three empty stars, named "no stars yet"', () => {
    mount({ maps: TWO_MAPS, statusOf: () => ({ unlocked: true, bestStars: 0 }) });
    const map = button('Training Ground, no stars yet');
    expect(shown(map, 'stars')?.textContent).toBe('☆☆☆');
    expect(shown(map, 'locked')).toBeNull();
    expect(map?.getAttribute('aria-disabled')).toBeNull();
  });

  it.each([
    [1, '★☆☆'],
    [2, '★★☆'],
    [3, '★★★'],
  ] as const)('shows a best of %i stars as %s, and says it in the name', (bestStars, glyphs) => {
    mount({ maps: TWO_MAPS, statusOf: () => ({ unlocked: true, bestStars }) });
    const map = button(`Training Ground, ${bestStars} of 3 stars`);
    expect(shown(map, 'stars')?.textContent).toBe(glyphs);
  });

  it('hides the star glyphs and the lock mark from screen readers, which read the name', () => {
    mount({ maps: TWO_MAPS, statusOf: (index) => ({ unlocked: index === 0, bestStars: 2 }) });
    expect(shown(mapButton('Training Ground'), 'stars')?.getAttribute('aria-hidden')).toBe('true');
    expect(shown(mapButton('Second Map'), 'locked')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a locked map as Locked with a lock mark, named with what unlocks it; a click on it picks nothing', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick, statusOf: (index) => ({ unlocked: index === 0, bestStars: 0 }) });
    const locked = button('Second Map, locked. Complete Training Ground to unlock');
    expect(locked?.getAttribute('aria-disabled')).toBe('true');
    expect(shown(locked, 'locked')?.textContent).toBe('🔒 Locked');
    expect(shown(locked, 'stars')).toBeNull();
    locked?.click();
    expect(onPick).not.toHaveBeenCalled();
    mapButton('Training Ground')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith(MAPS[0]!.id);
  });

  it('calls onBack when the player presses Back', () => {
    const onBack = vi.fn();
    mount({ onBack });
    button('Back')?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('focuses the first map when it opens', () => {
    mount();
    expect(document.activeElement).toBe(mapButton(MAPS[0]!.name));
  });

  it('focuses the last unlocked map when it opens', () => {
    const THREE_MAPS = [...TWO_MAPS, { id: 'third', name: 'Third Map', data: { ...MAPS[0]!.data, id: 'third' } }];
    mount({ maps: THREE_MAPS, statusOf: (index) => ({ unlocked: index <= 1, bestStars: 0 }) });
    expect(document.activeElement).toBe(mapButton('Second Map'));
  });

  it('marks the app as on the level select, which hides the game UI, until destroyed', () => {
    const screen = mount();
    expect(app.dataset.screen).toBe('level-select');
    screen.destroy();
    expect(app.dataset.screen).toBeUndefined();
  });

  it('after destroy, is hidden and empty, and old buttons do nothing', () => {
    const onPick = vi.fn();
    const onBack = vi.fn();
    const screen = mount({ onPick, onBack });
    const [map, back] = [mapButton(MAPS[0]!.name)!, button('Back')!];
    screen.destroy();
    map.click();
    back.click();
    expect(onPick).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
