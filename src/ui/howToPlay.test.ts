// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEMY_NAMES, ENEMY_WEAKNESS, LEVEL_NAME, TERMS, TOWER_NAMES, TOWER_ROLES, formatFunds } from '../data/display';
import { ENEMY_STATS, PLAYABLE_KINDS } from '../data/enemies';
import { DIFFICULTIES, DIFFICULTY, scaledReward } from '../data/difficulty';
import { BUILD_KINDS, DISMANTLE_MS, SELL_REFUND, TOWER_STATS } from '../data/towers';
import { TACTICAL_MAX_STARS } from '../sim/progression';
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

  it('has a heading for each section, in the order the player meets them', () => {
    mountHowToPlay(root, { onBack: () => {} });
    expect(headings()).toEqual([
      'Protect HQ',
      'Placing towers',
      TERMS.money,
      'Upgrading and selling',
      'Ground, air and armor',
      'Waves',
      'Towers',
      'Enemies',
      'Keys',
    ]);
  });

  it.each([undefined, ...DIFFICULTIES])("uses the game's wording, never Lives, Money or exit (%s)", (difficulty) => {
    mountHowToPlay(root, { onBack: () => {}, difficulty });
    const text = root.textContent!;
    expect(text).not.toMatch(/Lives|Money|exit/i);
    for (const term of [TERMS.lives, TERMS.money, TERMS.callNextWave, TERMS.startWave]) expect(text).toContain(term);
  });

  it('from the menu, states the starting HQ and Funds for every difficulty', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const goal = section('Protect HQ').textContent!;
    const funds = section(TERMS.money).textContent!;
    for (const d of DIFFICULTIES) {
      expect(goal).toContain(`${DIFFICULTY[d].startLives} on ${DIFFICULTY[d].label}`);
      expect(funds).toContain(`${formatFunds(DIFFICULTY[d].startMoney)} on ${DIFFICULTY[d].label}`);
    }
  });

  it.each(DIFFICULTIES)("in a game on %s, states only that difficulty's starting HQ and Funds", (difficulty) => {
    mountHowToPlay(root, { onBack: () => {}, difficulty });
    const { startLives, startMoney } = DIFFICULTY[difficulty];
    expect(section('Protect HQ').textContent).toContain(`${TERMS.lives} starts at ${startLives}.`);
    expect(section(TERMS.money).textContent).toContain(`You start with ${formatFunds(startMoney)}.`);
    for (const d of DIFFICULTIES) expect(root.textContent).not.toContain(` on ${DIFFICULTY[d].label}`);
  });

  it('states the sell refund, the dismantle time and the upgrade levels from the data', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const text = section('Upgrading and selling').textContent!;
    expect(text).toContain(`${Math.round(SELL_REFUND * 100)}%`);
    expect(text).toContain(`${DISMANTLE_MS / 1000} seconds`);
    expect(text).toContain(LEVEL_NAME[2]);
    expect(text).toContain(LEVEL_NAME[3]);
    expect(section('Upgrading and selling').querySelectorAll('li')).toHaveLength(3);
  });

  it('names Call next wave, Tactical mode and its star cap', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const text = section('Waves').textContent!;
    expect(text).toContain(TERMS.callNextWave);
    expect(text).toContain('Tactical mode');
    expect(text).toContain(`at most ${TACTICAL_MAX_STARS} stars`);
  });

  it('lists every tower in play with its cost and role line', () => {
    mountHowToPlay(root, { onBack: () => {} });
    const items = [...section('Towers').querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(
      BUILD_KINDS.map((k) => `${TOWER_NAMES[k]} (${formatFunds(TOWER_STATS[k].cost)}): ${TOWER_ROLES[k]}`),
    );
  });

  it.each([undefined, ...DIFFICULTIES])(
    'lists every playable enemy with its reward, HQ cost and weakness line (%s)',
    (difficulty) => {
      mountHowToPlay(root, { onBack: () => {}, difficulty });
      const items = [...section('Enemies').querySelectorAll('li')].map((li) => li.textContent);
      const reward = (k: (typeof PLAYABLE_KINDS)[number]) => {
        const base = ENEMY_STATS[k].reward;
        if (difficulty) return formatFunds(scaledReward(base, difficulty));
        const hard = scaledReward(base, 'hard');
        return hard === base ? formatFunds(base) : `${formatFunds(base)}, ${formatFunds(hard)} on Hard`;
      };
      expect(items).toEqual(
        PLAYABLE_KINDS.map(
          (k) =>
            `${ENEMY_NAMES[k]} (reward ${reward(k)}; ${TERMS.lives} −${ENEMY_STATS[k].leakCost}): ${ENEMY_WEAKNESS[k]}`,
        ),
      );
    },
  );

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
