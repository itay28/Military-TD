import { ENEMY_NAMES, ENEMY_WEAKNESS, TOWER_NAMES, TOWER_ROLES } from '../data/display';
import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { START_LIVES, START_MONEY } from '../data/start';
import { DISMANTLE_MS, IN_PLAY_TOWERS, SELL_REFUND, TOWER_STATS } from '../data/towers';
import { KEY_MAP } from './keymap';

export interface HowToPlayScreen {
  /** What Back does: closes the screen, then calls `onBack`. */
  back(): void;
  /** Takes the screen away without calling `onBack`, for an opener that is going away itself. */
  close(): void;
}

/** What the Main menu and the pause menu are given to open the How to play screen; Back returns to them through `onBack`. */
export type OpenHowToPlay = (onBack: () => void) => HowToPlayScreen;

const TITLE_ID = 'how-to-play-title';

/** Builds a `{ tag, text }` helper bound to `doc`. */
const maker = (doc: Document) => {
  return <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
};

/**
 * Builds the How to play screen inside `root`, a dialog over the whole page like Settings. Short sections written
 * from the game's data (Lives, Money, the tower and enemy lines, the key map), so they can't drift from the rules.
 * Esc and Back close it; the pause menu catches Esc first while paused and calls back() itself.
 */
export function mountHowToPlay(root: HTMLElement, { onBack }: { readonly onBack: () => void }): HowToPlayScreen {
  const doc = root.ownerDocument;
  const el = maker(doc);
  const section = (title: string, ...content: HTMLElement[]) => {
    const s = el('section');
    s.append(el('h3', title), ...content);
    return s;
  };
  const list = (items: string[]) => {
    const ul = el('ul');
    ul.append(...items.map((text) => el('li', text)));
    return ul;
  };

  const towerKinds = IN_PLAY_TOWERS;
  const enemyKinds = Object.keys(ENEMY_STATS) as EnemyKind[];

  const keys = el('table');
  const head = keys.createTHead().insertRow();
  for (const text of ['Key', 'Action']) {
    const th = el('th', text);
    th.scope = 'col';
    head.append(th);
  }
  const keyBody = keys.createTBody();
  for (const { label, description } of KEY_MAP) {
    const row = keyBody.insertRow();
    const th = el('th');
    th.scope = 'row';
    th.append(el('kbd', label));
    row.append(th);
    row.insertCell().textContent = description;
  }

  const body = el('div');
  body.className = 'how-to-play-body';
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', 'How to play');
  body.tabIndex = 0;
  body.append(
    section(
      'The goal',
      el(
        'p',
        `Stop the enemies reaching the exit. Each one that gets through costs Lives, and you start with ${START_LIVES} Lives. Lose them all and the game is lost.`,
      ),
    ),
    section(
      'Money',
      el(
        'p',
        `You start with ${START_MONEY} Money. Every enemy you stop pays a reward. Towers and upgrades cost Money. Selling a tower refunds ${Math.round(SELL_REFUND * 100)}% of what you spent on it, after ${DISMANTLE_MS / 1000} seconds.`,
      ),
    ),
    section(
      'Placing, upgrading and selling',
      list([
        'Place: pick a tower in the build bar, then tap a buildable tile.',
        'Upgrade: tap a tower to open its panel, then Upgrade. Each level adds range or firepower.',
        'Sell: tap a tower, then Sell.',
      ]),
    ),
    section(
      'Ground, air and armor',
      list([
        'Ground and air: every enemy walks or flies, and each tower can hit only some layers.',
        'Armor: armor is subtracted from every hit, so weak rounds do little against armored enemies.',
      ]),
    ),
    section('Towers', list(towerKinds.map((k) => `${TOWER_NAMES[k]} (${TOWER_STATS[k].cost}): ${TOWER_ROLES[k]}`))),
    section(
      'Enemies',
      list(enemyKinds.map((k) => `${ENEMY_NAMES[k]} (reward ${ENEMY_STATS[k].reward}): ${ENEMY_WEAKNESS[k]}`)),
    ),
    section('Keys', keys),
  );

  const backButton = el('button', 'Back');
  backButton.type = 'button';
  const dialog = el('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = el('h2', 'How to play');
  heading.id = TITLE_ID;
  dialog.append(heading, body, backButton);
  root.append(dialog);
  root.hidden = false;
  backButton.focus();

  const win = doc.defaultView!;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    win.removeEventListener('keydown', backOnEscape);
    root.replaceChildren();
    root.hidden = true;
  };
  const back = () => {
    if (!open) return;
    close();
    onBack();
  };
  function backOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.repeat) back();
  }
  win.addEventListener('keydown', backOnEscape);
  backButton.addEventListener('click', back);
  return { back, close };
}
