// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Phase } from '../sim/game';
import { mountPauseMenu, type PauseMenu, type PauseMenuOptions } from './pauseMenu';

let root: HTMLElement;
let hud: HTMLElement;
let buildBar: HTMLElement;
let game: { state: { phase: Phase } };

const pauseButton = () => hud.querySelector<HTMLButtonElement>('button[data-testid="pause"]');
const button = (testId: string) => root.querySelector<HTMLButtonElement>(`button[data-testid="${testId}"]`);
const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');
// From the body, as a real keypress with nothing focused, so it bubbles through the document to the window.
const pressKey = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

let mounted: PauseMenu[] = [];
const mount = (options: Partial<PauseMenuOptions> = {}): PauseMenu => {
  const menu = mountPauseMenu(root, game, { buttonRoot: hud, blocked: [buildBar], onRestart: () => {}, ...options });
  mounted.push(menu);
  return menu;
};

// Its key listeners are on the window, which outlives each test's elements.
afterEach(() => {
  for (const menu of mounted) menu.destroy();
  mounted = [];
});

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  hud = document.createElement('div');
  buildBar = document.createElement('nav');
  document.body.append(hud, buildBar, root);
  game = { state: { phase: 'wave' } };
});

describe('mountPauseMenu', () => {
  it('starts unpaused, with a Pause button in the HUD and the overlay hidden', () => {
    const menu = mount();
    expect(menu.paused).toBe(false);
    expect(pauseButton()?.textContent).toBe('Pause');
    expect(root.hidden).toBe(true);
  });

  it('opens a Paused dialog when Pause is clicked', () => {
    const menu = mount();
    pauseButton()!.click();
    expect(menu.paused).toBe(true);
    expect(root.hidden).toBe(false);
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('h2')?.textContent).toBe('Paused');
  });

  it('focuses Resume when it opens', () => {
    mount().open();
    expect(document.activeElement).toBe(button('resume'));
  });

  it('closes when Resume is clicked', () => {
    const menu = mount();
    menu.open();
    button('resume')!.click();
    expect(menu.paused).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('toggles with the Esc key', () => {
    const menu = mount();
    pressKey('Escape');
    expect(menu.paused).toBe(true);
    pressKey('Escape');
    expect(menu.paused).toBe(false);
  });

  it('ignores other keys', () => {
    const menu = mount();
    pressKey('p');
    expect(menu.paused).toBe(false);
  });

  it('does not pause on an Esc another control already handled', () => {
    const menu = mount();
    const onKey = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener('keydown', onKey);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', onKey);
    expect(menu.paused).toBe(false);
  });

  it('keeps keys from the page while paused, so shortcuts do nothing', () => {
    const menu = mount();
    const seen: string[] = [];
    const onKey = (event: KeyboardEvent) => seen.push(event.key);
    document.addEventListener('keydown', onKey);
    menu.open();
    pressKey('1');
    pressKey('Escape');
    expect(seen).toEqual([]);
    expect(menu.paused).toBe(false);
    pressKey('1');
    document.removeEventListener('keydown', onKey);
    expect(seen).toEqual(['1']);
  });

  it('calls onRestart when Restart is clicked', () => {
    const onRestart = vi.fn();
    mount({ onRestart }).open();
    button('pause-restart')!.click();
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('calls onQuit when Quit to menu is clicked', () => {
    const onQuit = vi.fn();
    mount({ onQuit }).open();
    expect(button('quit')!.disabled).toBe(false);
    button('quit')!.click();
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('disables Quit to menu while there is no menu to quit to', () => {
    mount().open();
    expect(button('quit')!.disabled).toBe(true);
  });

  it('disables Settings until it exists', () => {
    mount().open();
    expect(button('settings')!.disabled).toBe(true);
  });

  it('makes the blocked areas inert only while paused', () => {
    const menu = mount();
    expect(buildBar.inert).toBe(false);
    menu.open();
    expect(buildBar.inert).toBe(true);
    menu.close();
    expect(buildBar.inert).toBe(false);
  });

  it('cannot be opened once the game is over, and disables the Pause button', () => {
    const menu = mount();
    game.state.phase = 'defeat';
    menu.update();
    expect(pauseButton()!.disabled).toBe(true);
    menu.open();
    pressKey('Escape');
    expect(menu.paused).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('closes if the game ends while it is open', () => {
    const menu = mount();
    menu.open();
    game.state.phase = 'victory';
    menu.update();
    expect(menu.paused).toBe(false);
    expect(buildBar.inert).toBe(false);
  });

  it('removes its elements, unblocks and stops listening on destroy', () => {
    const menu = mount();
    menu.open();
    menu.destroy();
    expect(pauseButton()).toBeNull();
    expect(dialog()).toBeNull();
    expect(root.hidden).toBe(true);
    expect(buildBar.inert).toBe(false);
    pressKey('Escape');
    expect(menu.paused).toBe(false);
  });
});
