// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Phase } from '../sim/game';
import { mountShortcuts, type ShortcutHandlers } from './shortcuts';

let game: { state: { phase: Phase } };
let handlers: { [K in keyof ShortcutHandlers]: Mock<() => void> };
let destroy: () => void;

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.replaceChildren();
  game = { state: { phase: 'build' } };
  handlers = { upgrade: vi.fn(), sell: vi.fn(), startWave: vi.fn(), cycleSpeed: vi.fn(), openHelp: vi.fn() };
  destroy = mountShortcuts(document, game, handlers).destroy;
});
afterEach(() => destroy());

describe('mountShortcuts', () => {
  it.each([
    ['u', 'upgrade'],
    ['S', 'sell'],
    [' ', 'startWave'],
    ['f', 'cycleSpeed'],
    ['?', 'openHelp'],
    ['h', 'openHelp'],
  ] as const)('%j calls %s', (key, handler) => {
    press(key);
    expect(handlers[handler]).toHaveBeenCalledOnce();
    for (const [name, fn] of Object.entries(handlers)) if (name !== handler) expect(fn, name).not.toHaveBeenCalled();
  });

  it('prevents Space’s default, so a focused button is not also clicked', () => {
    const button = document.createElement('button');
    document.body.append(button);
    expect(press(' ', {}, button).defaultPrevented).toBe(true);
  });

  it('ignores a held-down key’s repeats', () => {
    press('u', { repeat: true });
    expect(handlers.upgrade).not.toHaveBeenCalled();
  });

  it('does nothing with Ctrl held or in a text field', () => {
    press('u', { ctrlKey: true });
    const field = document.createElement('input');
    document.body.append(field);
    press('u', {}, field);
    expect(handlers.upgrade).not.toHaveBeenCalled();
  });

  it.each(['victory', 'defeat'] as const)(
    'does nothing once the game is over (%s): the End screen owns the keyboard',
    (phase) => {
      game.state.phase = phase;
      for (const key of ['u', 's', ' ', 'f', 'h']) press(key);
      for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it('leaves the keys it does not handle alone', () => {
    expect(press('1').defaultPrevented).toBe(false);
    expect(press('Escape').defaultPrevented).toBe(false);
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });

  it('stops listening once destroyed', () => {
    destroy();
    press('u');
    expect(handlers.upgrade).not.toHaveBeenCalled();
  });
});
