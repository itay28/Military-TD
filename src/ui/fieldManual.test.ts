// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import renderSprites from '../../scripts/render-sprite.json';
import { allDepicts, designationsIn, findDesignation } from '../data/designations';
import type { ModelView } from '../data/modelViews';
import { createProgress, type ProgressStore } from '../progress/progress';
import type { Faction } from '../sim/factions';
import { mountFieldManual, type FieldManual, type FieldManualOptions } from './fieldManual';

let root: HTMLElement;
let progress: ProgressStore;
let mounted: FieldManual[] = [];
/** Frame callbacks the screen asked for, run by `tick`. */
let frames: ((timeMs: number) => void)[] = [];
let backs = 0;

const turntable = (faction: Faction, kind: string): ModelView => ({
  turntable: { url: `${faction}-${kind}-turntable.webp`, frames: 24, frameSize: 384, columns: 6 },
  layers: [`${faction}-${kind}.png`],
});
const topDown = (faction: Faction, kind: string): ModelView => ({ layers: [`${faction}-${kind}.png`] });

const mount = (options: Partial<FieldManualOptions> = {}): FieldManual => {
  const screen = mountFieldManual(root, {
    progress,
    onBack: () => backs++,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: () => {},
    models: topDown,
    ...options,
  });
  mounted.push(screen);
  return screen;
};
const tick = (timeMs: number) => {
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(timeMs);
};
const button = (name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name);
const entry = (name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('.fm-list button')].find((b) => b.textContent === name);
const model = () => root.querySelector<HTMLElement>('[role="img"]')!;
const angle = () => Number(model().dataset.angle);
const images = () => [...model().querySelectorAll('img')];
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  document.body.innerHTML = '<div id="field-manual" hidden></div>';
  root = document.getElementById('field-manual')!;
  progress = createProgress();
  frames = [];
  backs = 0;
});

afterEach(() => {
  for (const screen of mounted) screen.close();
  mounted = [];
});

describe('mountFieldManual', () => {
  it('shows a Field manual dialog with towers and enemies in two groups, the first tower open', () => {
    mount();
    expect(root.hidden).toBe(false);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('h1, h2')?.textContent).toBe('Field manual');
    const groups = [...root.querySelectorAll('.fm-list h3')].map((h) => h.textContent);
    expect(groups).toEqual(['Towers', 'Enemies']);
    expect(entry('Rifle Nest')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('.fm-info h3')?.textContent).toBe('Rifle Nest');
    expect(document.activeElement).toBe(entry('Rifle Nest'));
  });

  it('shows a tower with its class line, role, stats as a definition list, and counters', () => {
    mount();
    entry('Cannon')!.click();
    const info = root.querySelector('.fm-info')!;
    expect(info.querySelector('h3')?.textContent).toBe('Cannon');
    expect(info.querySelector('.fm-class')?.textContent).toMatch(/gun/i);
    const dl = info.querySelector('dl')!;
    const terms = [...dl.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(expect.arrayContaining(['Cost', 'Damage', 'Range', 'Fire rate', 'Targets', 'Upgrades']));
    expect(info.textContent).toContain('Effective against');
    expect(info.textContent).toContain('Tank');
  });

  it('moves through both groups with the arrow keys, Home and End', () => {
    mount();
    key(entry('Rifle Nest')!, 'ArrowDown');
    expect(document.activeElement).toBe(entry('AA Gun'));
    expect(root.querySelector('.fm-info h3')?.textContent).toBe('AA Gun');
    key(document.activeElement!, 'End');
    expect(root.querySelector('.fm-info h3')?.textContent).toBe('Classified');
    key(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(entry('Rifle Nest'));
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(entry('Rifle Nest'));
  });

  it('keeps an enemy never met classified: a silhouette, no stats, no faction switcher', () => {
    mount();
    expect(entry('Tank')).toBeUndefined();
    const enemies = [...root.querySelectorAll('.fm-list ul')][1]!.querySelectorAll('button');
    expect([...enemies].every((b) => b.textContent === 'Classified')).toBe(true);
    enemies[0]!.click();
    expect(root.querySelector('.fm-info')?.textContent).toContain('CLASSIFIED: no contact yet');
    expect(root.querySelector('.fm-info dl')).toBeNull();
    expect(model().classList.contains('classified')).toBe(true);
    expect(model().getAttribute('aria-label')).toMatch(/unknown/i);
    expect(root.querySelector('[aria-label="Faction"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows an enemy once met, with what it is weak against', () => {
    progress.recordMet('tank');
    mount();
    entry('Tank')!.click();
    const info = root.querySelector('.fm-info')!;
    expect(info.querySelector('dl')?.textContent).toContain('Leak cost');
    expect(info.textContent).toContain('Weak against');
    expect(model().classList.contains('classified')).toBe(false);
    expect(model().getAttribute('aria-label')).toMatch(/Tank/);
  });

  it('spins the model on its own, and stops when the player turns it', () => {
    mount();
    expect(angle()).toBe(0);
    tick(1000);
    tick(2000);
    expect(angle()).toBeGreaterThan(0);
    const spun = angle();
    key(model(), 'ArrowRight');
    expect(angle()).toBe((spun + 15) % 360);
    tick(3000);
    expect(angle()).toBe((spun + 15) % 360);
  });

  it('does not spin with reduced motion, but still turns with the keys and buttons', () => {
    mount({ reducedMotion: true });
    tick(1000);
    tick(2000);
    expect(angle()).toBe(0);
    key(model(), 'ArrowLeft');
    expect(angle()).toBe(345);
    button('Rotate right')!.click();
    expect(angle()).toBe(0);
  });

  it('turns the model when dragged', () => {
    mount({ reducedMotion: true });
    const el = model();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientX: 160, pointerId: 1, bubbles: true }));
    expect(angle()).toBe(30);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 260, pointerId: 1, bubbles: true }));
    expect(angle()).toBe(30);
  });

  it('switches faction, keeping it across entries', () => {
    mount();
    expect(images()[0]?.getAttribute('src')).toBe('us-rifleNest.png');
    button('Russia')!.click();
    expect(button('Russia')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('US')?.getAttribute('aria-pressed')).toBe('false');
    expect(images()[0]?.getAttribute('src')).toBe('russia-rifleNest.png');
    entry('Mortar')!.click();
    expect(images()[0]?.getAttribute('src')).toBe('russia-mortar.png');
    expect(model().getAttribute('aria-label')).toBe('Mortar, Russia model');
  });

  it('loads the model when an entry opens, with a placeholder until it has', () => {
    mount();
    const placeholder = () => root.querySelector<HTMLElement>('.fm-loading')!;
    expect(placeholder().hidden).toBe(false);
    expect(images()).toHaveLength(1);
    images()[0]!.dispatchEvent(new Event('load'));
    expect(placeholder().hidden).toBe(true);
    entry('Cannon')!.click();
    expect(placeholder().hidden).toBe(false);
  });

  it('shows the turntable frame for the angle, and falls back to the top-down sprite when the sheet fails', () => {
    mount({ models: turntable, reducedMotion: true });
    const sheet = images()[0]!;
    expect(sheet.getAttribute('src')).toBe('us-rifleNest-turntable.webp');
    expect(model().dataset.frame).toBe('0');
    key(model(), 'ArrowRight');
    key(model(), 'ArrowRight');
    expect(model().dataset.frame).toBe('2');
    sheet.dispatchEvent(new Event('error'));
    expect(images()[0]?.getAttribute('src')).toBe('us-rifleNest.png');
    expect(model().dataset.frame).toBeUndefined();
  });

  it('goes back on Back or Esc, once', () => {
    const screen = mount();
    key(document.body, 'Escape');
    expect(backs).toBe(1);
    expect(root.hidden).toBe(true);
    key(document.body, 'Escape');
    screen.back();
    expect(backs).toBe(1);
    mount();
    button('Back')!.click();
    expect(backs).toBe(2);
  });

  it('close() takes it away without calling onBack, and stops the spin', () => {
    const screen = mount();
    screen.close();
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(backs).toBe(0);
    tick(1000);
    expect(frames).toHaveLength(0);
  });

  it('shows no real equipment designation', () => {
    progress.recordMet('tank');
    progress.recordMet('jeep');
    progress.recordMet('infantry');
    progress.recordMet('helicopter');
    mount();
    const banned = designationsIn(allDepicts(renderSprites));
    for (const b of root.querySelectorAll<HTMLButtonElement>('.fm-list button')) {
      b.click();
      expect(findDesignation(root.textContent ?? '', banned)).toBeUndefined();
      expect(findDesignation(model().getAttribute('aria-label') ?? '', banned)).toBeUndefined();
    }
  });
});
