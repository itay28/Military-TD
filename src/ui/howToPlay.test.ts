// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEMY_NAMES, ENEMY_WEAKNESS, TOWER_NAMES, TOWER_ROLES } from '../data/display';
import { ENEMY_STATS, PLAYABLE_KINDS } from '../data/enemies';
import { START_LIVES, START_MONEY } from '../data/start';
import { BUILD_KINDS, SELL_REFUND, TOWER_STATS } from '../data/towers';
import { mountHowToPlay } from './howToPlay';
import { KEY_MAP } from './keymap';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="how-to-play" hidden></div>';
  root = document.getElementById('how-to-play')!;
});

const headings = () => [...root.querySelectorAll('h3')].map((h) => h.textContent);
const section = (name: string) =>
  [...root.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === name)!;

describe('How to play screen', () => {
  it('is a labelled modal dialog titled How to play, shown, with Back focused', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('How to play');
    expect(root.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe('Back');
  });

  it('has a heading for each short section, in order', () => {
    mountHowToPlay(root, { onBack: () => {} });
    expect(headings()).toEqual([
      'The goal',
      'Money',
      'Placing, upgrading and selling',
      'Ground, air and armor',
      'Towers',
      'Enemies',
      'Keys',
    ]);
  });

  it('states the starting Lives and Money and the sell refund from the data', () => {
    mountHowToPlay(root, { onBack: () => {} });
    expect(section('The goal').textContent).toContain(`${START_LIVES} Lives`);
    const money = section('Money').textContent!;
    expect(money).toContain(`${START_MONEY}`);
    expect(money).toContain(`${Math.round(SELL_REFUND * 100)}%`);
  });

  it('lists every tower with its cost and role line', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const items = [...section('Towers').querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(BUILD_KINDS.map((k) => `${TOWER_NAMES[k]} (${TOWER_STATS[k].cost}): ${TOWER_ROLES[k]}`));
  });

  it('lists every playable enemy (not the Jet yet) with its reward and weakness line', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const items = [...section('Enemies').querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(
      PLAYABLE_KINDS.map((k) => `${ENEMY_NAMES[k]} (reward ${ENEMY_STATS[k].reward}): ${ENEMY_WEAKNESS[k]}`),
    );
  });

  it('lists every row of the key map', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const rows = [...section('Keys').querySelectorAll('tbody tr')].map((r) => [
      r.querySelector('th')?.textContent,
      r.querySelector('td')?.textContent,
    ]);
    expect(rows).toEqual(KEY_MAP.map((k) => [k.label, k.description]));
  });

  it('scrolls on its own: the content is a labelled, focusable region', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const region = root.querySelector('.how-to-play-body')!;
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('How to play');
  });

  it('calls onBack once from the Back button and from Esc, then closes', () => {
    const onBack = vi.fn();
    mountHowToPlay(root, { onBack });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
  });

  it('Back button calls onBack', () => {
    const onBack = vi.fn();
    mountHowToPlay(root, { onBack });
    root.querySelector('button')!.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('close() takes it away without calling onBack, and Esc then does nothing', () => {
    const onBack = vi.fn();
    const screen = mountHowToPlay(root, { onBack });
    screen.close();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
  });
});
