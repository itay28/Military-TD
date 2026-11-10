// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { KEY_MAP, SHORTCUT_ACTIONS, shortcutFor } from './keymap';

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  let action: ReturnType<typeof shortcutFor>;
  target.addEventListener('keydown', (e) => (action = shortcutFor(e as KeyboardEvent)), { once: true });
  target.dispatchEvent(event);
  return action;
};

describe('KEY_MAP', () => {
  it('gives every action at least one key, a label and a description', () => {
    for (const action of SHORTCUT_ACTIONS) {
      const row = KEY_MAP.find((entry) => entry.action === action);
      expect(row, action).toBeDefined();
      expect(row!.keys.length, action).toBeGreaterThan(0);
      expect(row!.label, action).not.toBe('');
      expect(row!.description, action).not.toBe('');
    }
  });

  it('lists only known actions, each once', () => {
    expect(KEY_MAP.map((entry) => entry.action).sort()).toEqual([...SHORTCUT_ACTIONS].sort());
  });

  it('binds no key to two actions', () => {
    const keys = KEY_MAP.flatMap((entry) => entry.keys.map((key) => key.toLowerCase()));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('shortcutFor', () => {
  it.each([
    ['u', 'upgrade'],
    ['U', 'upgrade'],
    ['s', 'sell'],
    [' ', 'startWave'],
    ['f', 'cycleSpeed'],
    ['p', 'pause'],
    ['Escape', 'pause'],
    ['?', 'help'],
    ['h', 'help'],
    ['H', 'help'],
    ['1', 'build'],
    ['9', 'build'],
  ] as const)('maps %j to %s', (key, action) => {
    expect(press(key)).toBe(action);
  });

  it('maps an unbound key to nothing', () => {
    expect(press('x')).toBeUndefined();
    expect(press('0')).toBeUndefined();
  });

  it('allows Shift, so ? (Shift+/) and a capital letter work', () => {
    expect(press('?', { shiftKey: true })).toBe('help');
    expect(press('U', { shiftKey: true })).toBe('upgrade');
  });

  it.each(['ctrlKey', 'altKey', 'metaKey'] as const)('does nothing with %s held', (modifier) => {
    expect(press('u', { [modifier]: true })).toBeUndefined();
  });

  it.each([
    ['a text field', () => Object.assign(document.createElement('input'), { type: 'text' })],
    ['a range input', () => Object.assign(document.createElement('input'), { type: 'range' })],
    ['a textarea', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
  ])('does nothing while focus is in %s', (_, make) => {
    const field = make();
    document.body.append(field);
    expect(press('u', {}, field)).toBeUndefined();
    field.remove();
  });

  it('still works from a focused button or checkbox', () => {
    const button = document.createElement('button');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    document.body.append(button, checkbox);
    expect(press('u', {}, button)).toBe('upgrade');
    expect(press('u', {}, checkbox)).toBe('upgrade');
    button.remove();
    checkbox.remove();
  });
});
