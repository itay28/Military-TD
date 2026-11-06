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

  it('offers ×1, ×2 and ×3 as one labelled group, with the current default checked', () => {
    settings.set({ defaultSpeed: 2 });
    mount();
    const group = root.querySelector('fieldset');
    expect(group?.querySelector('legend')?.textContent).toBe('Default game speed');
    const radios = [...group!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map(labelOf)).toEqual(['×1', '×2', '×3']);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
  });

  it('sets the default speed as soon as one is picked', () => {
    mount();
    speed('×3')!.click();
    expect(settings.get().defaultSpeed).toBe(3);
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

  it('has a labelled Show map grid checkbox, on at first, that switches the setting at once (#400)', () => {
    mount();
    const box = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => labelOf(input) === 'Show map grid',
    )!;
    expect(box.checked).toBe(true);
    box.click();
    expect(settings.get().showMapGrid).toBe(false);
    box.click();
    expect(settings.get().showMapGrid).toBe(true);
  });

  describe('volume sliders (#67)', () => {
    const sliders = () => [...root.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    const nameOf = (input: HTMLInputElement) => root.querySelector(`label[for="${input.id}"]`)?.textContent;
    const slider = (name: string) => sliders().find((input) => nameOf(input) === name)!;
    const slide = (input: HTMLInputElement, value: number) => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const shown = (input: HTMLInputElement) => root.querySelector(`output[for="${input.id}"]`)?.textContent;

    it('has a labelled 0–100 slider each for master, music and sound effects, at the current values', () => {
      settings.set({ masterVolume: 70, musicVolume: 35, sfxVolume: 100 });
      mount();
      expect(sliders().map(nameOf)).toEqual(['Master volume', 'Music volume', 'Sound effects volume']);
      for (const input of sliders()) {
        expect([input.min, input.max, input.step]).toEqual(['0', '100', '5']);
      }
      expect(sliders().map((input) => input.value)).toEqual(['70', '35', '100']);
    });

    it('shows and announces each value as a percentage', () => {
      mount();
      expect(sliders().map((input) => input.getAttribute('aria-valuetext'))).toEqual(['80%', '60%', '80%']);
      expect(sliders().map(shown)).toEqual(['80%', '60%', '80%']);
    });

    it.each([
      ['Master volume', 'masterVolume'],
      ['Music volume', 'musicVolume'],
      ['Sound effects volume', 'sfxVolume'],
    ] as const)('%s changes its setting as it slides, and its shown value with it', (name, field) => {
      mount();
      const input = slider(name);
      slide(input, 25);
      expect(settings.get()[field]).toBe(25);
      expect(input.getAttribute('aria-valuetext')).toBe('25%');
      expect(shown(input)).toBe('25%');
      slide(input, 0);
      expect(settings.get()[field]).toBe(0);
    });

    it('leaves the other settings alone', () => {
      mount();
      slide(slider('Music volume'), 10);
      expect(settings.get()).toMatchObject({ masterVolume: 80, sfxVolume: 80, defaultSpeed: 1, showAllRanges: false });
    });
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

  describe('reduce motion and text size (#354)', () => {
    const checkboxNamed = (name: string) =>
      [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((box) => labelOf(box) === name);
    const textSizeGroup = () =>
      [...root.querySelectorAll('fieldset')].find((set) => set.querySelector('legend')?.textContent === 'Text size');
    const textSizes = () => [...textSizeGroup()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

    it('offers a labelled Reduce motion checkbox showing the current setting', () => {
      settings.set({ reducedMotion: true });
      mount();
      expect(checkboxNamed('Reduce motion')?.checked).toBe(true);
    });

    it('switches reduced motion as soon as the box is toggled', () => {
      mount();
      checkboxNamed('Reduce motion')!.click();
      expect(settings.get().reducedMotion).toBe(true);
      checkboxNamed('Reduce motion')!.click();
      expect(settings.get().reducedMotion).toBe(false);
    });

    it('offers 100 %, 125 % and 150 % as one labelled group, with the current size checked', () => {
      settings.set({ textSize: 125 });
      mount();
      const radios = textSizes();
      expect(radios.map(labelOf)).toEqual(['100 %', '125 %', '150 %']);
      expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
      expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    });

    it('sets the text size as soon as one is picked', () => {
      mount();
      textSizes()[2]!.click();
      expect(settings.get().textSize).toBe(150);
    });

    it('keeps the speed and text size groups apart: picking a size leaves the speed alone', () => {
      mount();
      textSizes()[1]!.click();
      expect(settings.get().defaultSpeed).toBe(1);
      expect(speed('×1')!.checked).toBe(true);
    });
  });
});
