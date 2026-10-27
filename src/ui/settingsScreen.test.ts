// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettings, type SettingsStore } from '../settings/settings';
import { mountSettingsScreen, type SettingsScreen } from './settingsScreen';

let root: HTMLElement;
let settings: SettingsStore;

// The text of the <label> an input sits in: its accessible name.
const labelOf = (input: HTMLInputElement) => input.closest('label')?.textContent?.trim();
const speed = (label: string) =>
  [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((radio) => labelOf(radio) === label);
const checkbox = () => root.querySelector<HTMLInputElement>('input[type="checkbox"]');
const back = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Back');
const pressKey = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

let mounted: SettingsScreen[] = [];
const mount = (onBack: () => void = () => {}): SettingsScreen => {
  const screen = mountSettingsScreen(root, settings, { onBack });
  mounted.push(screen);
  return screen;
};

// Its Esc listener is on the window, which outlives each test's elements.
afterEach(() => {
  for (const screen of mounted) screen.close();
  mounted = [];
});

beforeEach(() => {
  document.body.innerHTML = '<div id="settings" hidden></div>';
  root = document.getElementById('settings')!;
  settings = createSettings();
});

describe('mountSettingsScreen', () => {
  it('shows a Settings dialog', () => {
    mount();
    expect(root.hidden).toBe(false);
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('h2')?.textContent).toBe('Settings');
  });

  it('offers ×1, ×2 and ×4 as one labelled group, with the current default checked', () => {
    settings.set({ defaultSpeed: 2 });
    mount();
    const group = root.querySelector('fieldset');
    expect(group?.querySelector('legend')?.textContent).toBe('Default game speed');
    const radios = [...group!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map(labelOf)).toEqual(['×1', '×2', '×4']);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
  });

  it('sets the default speed as soon as one is picked', () => {
    mount();
    speed('×4')!.click();
    expect(settings.get().defaultSpeed).toBe(4);
  });

  it('has a labelled Always show tower ranges checkbox that switches the setting at once', () => {
    mount();
    expect(labelOf(checkbox()!)).toBe('Always show tower ranges');
    expect(checkbox()!.checked).toBe(false);
    checkbox()!.click();
    expect(settings.get().showAllRanges).toBe(true);
    checkbox()!.click();
    expect(settings.get().showAllRanges).toBe(false);
  });

  it('has no volume controls (#67)', () => {
    mount();
    expect(root.querySelector('input[type="range"]')).toBeNull();
    expect(root.textContent).not.toMatch(/volume/i);
  });

  it('focuses the checked speed when it opens', () => {
    mount();
    expect(document.activeElement).toBe(speed('×1'));
  });

  it('closes and calls onBack when Back is pressed', () => {
    const onBack = vi.fn();
    mount(onBack);
    back()!.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('back() does what Back does', () => {
    const onBack = vi.fn();
    mount(onBack).back();
    expect(onBack).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
  });

  it('goes back on Esc', () => {
    const onBack = vi.fn();
    mount(onBack);
    pressKey('Escape');
    expect(onBack).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
  });

  it('close() takes it away without calling onBack, and Esc does nothing after', () => {
    const onBack = vi.fn();
    mount(onBack).close();
    expect(root.hidden).toBe(true);
    pressKey('Escape');
    expect(onBack).not.toHaveBeenCalled();
  });
});
