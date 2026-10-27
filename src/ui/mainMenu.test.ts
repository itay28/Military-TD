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
  it('shows the title and a Play and a Settings button', () => {
    mountMainMenu(root, { app, onPlay: () => {} });
    expect(root.hidden).toBe(false);
    expect(root.querySelector('h1')?.textContent).toBe('Military TD');
    expect(button('Play')?.type).toBe('button');
    expect(button('Settings')?.type).toBe('button');
  });

  it('disables Settings until the Settings screen exists (#48)', () => {
    mountMainMenu(root, { app, onPlay: () => {} });
    expect(button('Play')?.disabled).toBe(false);
    expect(button('Settings')?.disabled).toBe(true);
  });

  it('calls onPlay when the player presses Play', () => {
    const onPlay = vi.fn();
    mountMainMenu(root, { app, onPlay });
    button('Play')?.click();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('focuses Play when it opens', () => {
    mountMainMenu(root, { app, onPlay: () => {} });
    expect(document.activeElement).toBe(button('Play'));
  });

  it('marks the app as on the menu, which hides the HUD, build bar and tower panel, until destroyed', () => {
    const menu = mountMainMenu(root, { app, onPlay: () => {} });
    expect(app.dataset.screen).toBe('menu');
    menu.destroy();
    expect(app.dataset.screen).toBeUndefined();
  });

  it('after destroy, is hidden and empty, and an old Play button does nothing', () => {
    const onPlay = vi.fn();
    const menu = mountMainMenu(root, { app, onPlay });
    const play = button('Play')!;
    menu.destroy();
    play.click();
    expect(onPlay).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
