// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountMainMenu } from './mainMenu';

let app: HTMLElement;
let root: HTMLElement;
const button = (name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name);

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="menu" hidden></div>';
  app = document.getElementById('app')!;
  root = document.getElementById('menu')!;
});

describe('Main menu', () => {
  it('shows the title and a Play, a Settings and a Credits button', () => {
    mountMainMenu(root, { app, onPlay: () => {}, onCredits: () => {} });
    expect(root.hidden).toBe(false);
    expect(root.querySelector('h1')?.textContent).toBe('Military TD');
    expect(button('Play')?.type).toBe('button');
    expect(button('Settings')?.type).toBe('button');
    expect(button('Credits')?.type).toBe('button');
  });

  it('calls onCredits when the player presses Credits, which is enabled', () => {
    const onCredits = vi.fn();
    mountMainMenu(root, { app, onPlay: () => {}, onCredits });
    expect(button('Credits')?.disabled).toBe(false);
    button('Credits')?.click();
    expect(onCredits).toHaveBeenCalledOnce();
  });

  it('focuses Credits when asked to, as when coming back from the Credits screen', () => {
    mountMainMenu(root, { app, onPlay: () => {}, onCredits: () => {}, initialFocus: 'credits' });
    expect(document.activeElement).toBe(button('Credits'));
  });

  it('disables Settings until the Settings screen exists (#48)', () => {
    mountMainMenu(root, { app, onPlay: () => {}, onCredits: () => {} });
    expect(button('Play')?.disabled).toBe(false);
    expect(button('Settings')?.disabled).toBe(true);
  });

  it('calls onPlay when the player presses Play', () => {
    const onPlay = vi.fn();
    mountMainMenu(root, { app, onPlay, onCredits: () => {} });
    button('Play')?.click();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('focuses Play when it opens', () => {
    mountMainMenu(root, { app, onPlay: () => {}, onCredits: () => {} });
    expect(document.activeElement).toBe(button('Play'));
  });

  it('marks the app as on the menu, which hides the HUD, build bar and tower panel, until destroyed', () => {
    const menu = mountMainMenu(root, { app, onPlay: () => {}, onCredits: () => {} });
    expect(app.dataset.screen).toBe('menu');
    menu.destroy();
    expect(app.dataset.screen).toBeUndefined();
  });

  it('after destroy, is hidden and empty, and an old Play button does nothing', () => {
    const onPlay = vi.fn();
    const menu = mountMainMenu(root, { app, onPlay, onCredits: () => {} });
    const play = button('Play')!;
    menu.destroy();
    play.click();
    expect(onPlay).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
