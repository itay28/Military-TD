// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAPS, type MapEntry } from '../data/maps';
import { mountLevelSelect, type LevelSelectOptions } from './levelSelect';

let app: HTMLElement;
let root: HTMLElement;
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
const button = (name: string) => buttons().find((b) => b.textContent?.trim() === name);

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
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Training Ground', 'Second Map', 'Back']);
    expect(buttons().every((b) => b.type === 'button')).toBe(true);
  });

  it('gives each map a preview canvas, hidden from screen readers so the name is the button’s name', () => {
    mount();
    const canvas = button(MAPS[0]!.name)?.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.width).toBeGreaterThan(0);
  });

  it('calls onPick with the map id when the player picks a map', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick });
    button('Second Map')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('second');
  });

  it('disables a locked map and says it is locked; a click on it picks nothing', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick, isUnlocked: (index) => index === 0 });
    const locked = button('Second Map (locked)');
    expect(locked?.disabled).toBe(true);
    locked?.click();
    expect(onPick).not.toHaveBeenCalled();
    button('Training Ground')?.click();
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
    expect(document.activeElement).toBe(button(MAPS[0]!.name));
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
    const [map, back] = [button(MAPS[0]!.name)!, button('Back')!];
    screen.destroy();
    map.click();
    back.click();
    expect(onPick).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
