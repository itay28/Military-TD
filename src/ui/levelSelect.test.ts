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
const briefing = () => root.querySelector<HTMLElement>('[data-testid="briefing"]');
const shown = (b: HTMLElement | undefined, testid: string) => b?.querySelector(`[data-testid="${testid}"]`);

const TWO_MAPS: readonly MapEntry[] = [
  MAPS[0]!,
  { ...MAPS[0]!, id: 'second', name: 'Second Map', data: { ...MAPS[0]!.data, id: 'second' } },
];

describe('Tactical mode note (#413)', () => {
  it('says "Tactical: max 2 stars" under the title while Tactical mode is on', () => {
    mount({ tacticalMode: true });
    expect(root.querySelector('[data-testid="tactical-cap"]')?.textContent).toBe('Tactical: max 2 stars');
  });

  it('says nothing of it while Tactical mode is off', () => {
    mount();
    expect(root.querySelector('[data-testid="tactical-cap"]')).toBeNull();
  });
});

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
    expect(root.querySelector('h1')?.textContent).toBe('Operations');
    expect(buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      'Training Ground, no stars yet',
      'Training Ground, Hard, locked. Win Training Ground on Normal to unlock',
      'Second Map, no stars yet',
      'Second Map, Hard, locked. Win Second Map on Normal to unlock',
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

  it('shows a map’s aerial ground image on its card (#401)', () => {
    mount();
    expect(mapButton(MAPS[0]!.name)?.querySelector('img')?.getAttribute('src')).toBe(MAPS[0]!.groundImageUrl);
  });

  it('calls onPick with the map id when the player deploys from the map’s briefing', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick });
    mapButton('Second Map')?.click();
    expect(onPick).not.toHaveBeenCalled();
    button('Deploy')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('second', 'normal');
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

  it('shows a locked map as "Locked: complete <the map before>" with no emoji, named with what unlocks it; a click on it picks nothing', () => {
    const onPick = vi.fn();
    mount({ maps: TWO_MAPS, onPick, statusOf: (index) => ({ unlocked: index === 0, bestStars: 0 }) });
    const locked = button('Second Map, locked. Complete Training Ground to unlock');
    expect(locked?.getAttribute('aria-disabled')).toBe('true');
    expect(shown(locked, 'locked')?.textContent).toBe('Locked: complete Training Ground');
    expect(shown(locked, 'stars')).toBeNull();
    locked?.click();
    expect(briefing()).toBeNull();
    mapButton('Training Ground')?.click();
    button('Deploy')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith(MAPS[0]!.id, 'normal');
  });

  it('calls onBack when the player presses Back', () => {
    const onBack = vi.fn();
    mount({ onBack });
    button('Back')?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('focuses the first map when it opens, when it is the only one unlocked', () => {
    mount({ statusOf: (index) => ({ unlocked: index === 0, bestStars: 0 }) });
    expect(document.activeElement).toBe(mapButton(MAPS[0]!.name));
  });

  it('focuses the last unlocked map when it opens', () => {
    const THREE_MAPS = [
      ...TWO_MAPS,
      { ...MAPS[0]!, id: 'third', name: 'Third Map', data: { ...MAPS[0]!.data, id: 'third' } },
    ];
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

describe('briefing (#401)', () => {
  it('opens when the player picks an unlocked map: the map list and Back are hidden, focus is on Deploy', () => {
    mount({ maps: TWO_MAPS });
    mapButton('Second Map')?.click();
    expect(briefing()?.querySelector('h2')?.textContent).toBe(TWO_MAPS[1]!.briefing.operation);
    expect(root.querySelector('ul')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(':scope > button')?.hidden).toBe(true);
    expect(document.activeElement?.textContent).toBe('Deploy');
  });

  it('Back closes it and returns focus to the map’s card, without picking or leaving the screen', () => {
    const onPick = vi.fn();
    const onBack = vi.fn();
    mount({ maps: TWO_MAPS, onPick, onBack });
    mapButton('Second Map')?.click();
    buttons()
      .find((b) => b.textContent === 'Back' && briefing()?.contains(b))
      ?.click();
    expect(briefing()).toBeNull();
    expect(root.querySelector('ul')?.hidden).toBe(false);
    expect(document.activeElement).toBe(mapButton('Second Map'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('Escape closes it like Back', () => {
    mount({ maps: TWO_MAPS });
    mapButton('Training Ground')?.click();
    briefing()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(briefing()).toBeNull();
    expect(document.activeElement).toBe(mapButton('Training Ground'));
  });

  it('does nothing after destroy', () => {
    const onPick = vi.fn();
    const screen = mount({ onPick });
    mapButton(MAPS[0]!.name)?.click();
    const deploy = button('Deploy')!;
    screen.destroy();
    deploy.click();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('Hard (#466)', () => {
  const hardButton = (name: string) =>
    buttons().find((b) => b.getAttribute('aria-label')?.startsWith(`${name}, Hard,`));

  it('gives each unlocked map a Hard button under its card, showing the Hard stars and saying them in its name', () => {
    mount({
      maps: TWO_MAPS,
      statusOf: (index) => ({ unlocked: true, bestStars: 3, hardUnlocked: true, hardStars: index === 0 ? 2 : 0 }),
    });
    const first = hardButton('Training Ground');
    expect(first?.getAttribute('aria-label')).toBe('Training Ground, Hard, 2 of 3 stars');
    expect(first?.textContent).toBe('Hard ★★☆');
    expect(first?.getAttribute('aria-disabled')).toBeNull();
    expect(first?.type).toBe('button');
    expect(hardButton('Second Map')?.getAttribute('aria-label')).toBe('Second Map, Hard, no stars yet');
    expect(hardButton('Second Map')?.textContent).toBe('Hard ☆☆☆');
    expect(first?.closest('li')).toBe(mapButton('Training Ground')?.closest('li'));
  });

  it('shows a locked Hard as "🔒 Hard", focusable and aria-disabled, named with what unlocks it; a click picks nothing', () => {
    const onPick = vi.fn();
    mount({
      maps: TWO_MAPS,
      onPick,
      statusOf: () => ({ unlocked: true, bestStars: 0, hardUnlocked: false, hardStars: 0 }),
    });
    const locked = button('Second Map, Hard, locked. Win Second Map on Normal to unlock');
    expect(locked?.textContent).toBe('🔒 Hard');
    expect(locked?.getAttribute('aria-disabled')).toBe('true');
    expect(locked?.disabled).toBe(false);
    locked?.click();
    expect(briefing()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('opens the map’s briefing from an unlocked Hard, whose Deploy picks the map on Hard', () => {
    const onPick = vi.fn();
    mount({
      maps: TWO_MAPS,
      onPick,
      statusOf: () => ({ unlocked: true, bestStars: 1, hardUnlocked: true, hardStars: 0 }),
    });
    hardButton('Second Map')?.click();
    expect(briefing()?.querySelector('h2')?.textContent).toBe(TWO_MAPS[1]!.briefing.operation);
    button('Deploy')?.click();
    expect(onPick).toHaveBeenCalledExactlyOnceWith('second', 'hard');
  });

  it('returns focus to the Hard button when its briefing closes', () => {
    mount({ maps: TWO_MAPS, statusOf: () => ({ unlocked: true, bestStars: 1, hardUnlocked: true, hardStars: 0 }) });
    hardButton('Training Ground')?.click();
    briefing()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(hardButton('Training Ground'));
  });

  it('shows no Hard button on a locked map', () => {
    mount({ maps: TWO_MAPS, statusOf: (index) => ({ unlocked: index === 0, bestStars: 0 }) });
    expect(hardButton('Second Map')).toBeUndefined();
    expect(hardButton('Training Ground')).toBeDefined();
  });

  it('shows no Hard button on any map when showHard is off (#536)', () => {
    mount({ maps: TWO_MAPS, showHard: false, statusOf: () => ({ unlocked: true, bestStars: 3, hardUnlocked: true }) });
    expect(hardButton('Training Ground')).toBeUndefined();
    expect(hardButton('Second Map')).toBeUndefined();
  });

  it('still focuses the last unlocked map, not its Hard button, when it opens', () => {
    mount({ maps: TWO_MAPS, statusOf: () => ({ unlocked: true, bestStars: 3, hardUnlocked: true, hardStars: 0 }) });
    expect(document.activeElement).toBe(mapButton('Second Map'));
  });
});
