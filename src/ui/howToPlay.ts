import { DIFFICULTIES, DIFFICULTY, scaledReward, type Difficulty } from '../data/difficulty';
import { ENEMY_NAMES, ENEMY_WEAKNESS, LEVEL_NAME, TERMS, TOWER_NAMES, TOWER_ROLES, formatFunds } from '../data/display';
import { ENEMY_STATS, PLAYABLE_KINDS } from '../data/enemies';
import { BUILD_KINDS, DISMANTLE_MS, SELL_REFUND, TOWER_STATS } from '../data/towers';
import { TACTICAL_MAX_STARS } from '../sim/progression';
import { KEY_MAP } from './keymap';

export interface HowToPlayScreen {
  /** What Back does: closes the screen, then calls `onBack`. */
  back(): void;
  /** Takes the screen away without calling `onBack`, for an opener that is going away itself. */
  close(): void;
}

/**
 * What the Main menu and the pause menu are given to open the How to play screen; Back returns to them through
 * `onBack`. The pause menu passes the game's difficulty; without one the screen gives every difficulty's numbers.
 */
export type OpenHowToPlay = (onBack: () => void, difficulty?: Difficulty) => HowToPlayScreen;

export interface HowToPlayOptions {
  readonly onBack: () => void;
  /** The current game's difficulty, whose starting HQ, Funds and rewards the text gives. None: all of them. */
  readonly difficulty?: Difficulty | undefined;
}

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
 * Builds the How to play screen inside `root`, a dialog over the whole page like Settings. Sections in the order the
 * player meets them (#571), in the HUD's words (`TERMS`), with every number from the game's data for the difficulty,
 * so the text can't drift from the rules.
 * Esc and Back close it; the pause menu catches Esc first while paused and calls back() itself.
 */
export function mountHowToPlay(root: HTMLElement, { onBack, difficulty }: HowToPlayOptions): HowToPlayScreen {
  const doc = root.ownerDocument;
  const el = maker(doc);
  const section = (title: string, ...content: HTMLElement[]) => {
    const s = el('section');
    s.append(el('h3', title), ...content);
    return s;
  };
  const p = (text: string) => el('p', text);
  const list = (items: string[]) => {
    const ul = el('ul');
    ul.append(...items.map((text) => el('li', text)));
    return ul;
  };

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
  // Opened from the Main menu there is no game yet, so each starting number is given for every difficulty.
  const perDifficulty = (value: (d: Difficulty) => string) =>
    difficulty ? value(difficulty) : DIFFICULTIES.map((d) => `${value(d)} on ${DIFFICULTY[d].label}`).join(', ');
  const reward = (base: number) => {
    if (difficulty) return formatFunds(scaledReward(base, difficulty));
    const others = DIFFICULTIES.filter((d) => scaledReward(base, d) !== base);
    return [
      formatFunds(base),
      ...others.map((d) => `${formatFunds(scaledReward(base, d))} on ${DIFFICULTY[d].label}`),
    ].join(', ');
  };
  const { lives: hq, money: funds } = TERMS;

  body.append(
    section(
      `Protect ${hq}`,
      p(
        `Enemies move along the road toward your ${hq}. Each one that gets through damages it, and bigger enemies do more damage.`,
      ),
      p(
        `${hq} starts at ${perDifficulty((d) => `${DIFFICULTY[d].startLives}`)}. If it falls to 0, the mission fails. Hold out through the last wave and the mission is complete.`,
      ),
    ),
    section(
      'Placing towers',
      p(
        'Pick a tower in the build bar, then tap a tile you can build on. The tower fires at any enemy in its range that it can hit.',
      ),
      p(
        `Each tower costs ${funds}, and its button shows the price. A tower that covers several stretches of road gets more shots.`,
      ),
    ),
    section(
      funds,
      p(`You start with ${perDifficulty((d) => formatFunds(DIFFICULTY[d].startMoney))}.`),
      p(
        `Every enemy you stop pays a reward in ${funds}. You spend ${funds} on new towers and on upgrades, so a strong defense pays for the next tower.`,
      ),
    ),
    section(
      'Upgrading and selling',
      p(
        `Tap a tower to open its panel. Upgrade raises it one level: ${LEVEL_NAME[2]} adds range, then ${LEVEL_NAME[3]} adds damage and fire rate.`,
      ),
      p('Sell takes the tower down:'),
      list([
        `It stops firing at once and takes ${DISMANTLE_MS / 1000} seconds to dismantle.`,
        `When it's gone, you get back ${Math.round(SELL_REFUND * 100)}% of what you spent on it, upgrades included.`,
        'The tile is free to build on again.',
      ]),
    ),
    section(
      'Ground, air and armor',
      p(
        'Enemies either move on the ground or fly. Not every tower can hit both, so the tower list below says what each one reaches.',
      ),
      p(
        'Armor takes a fixed amount off every hit. Light, fast rounds lose most of their damage against a tank, while heavy shells punch through.',
      ),
    ),
    section(
      'Waves',
      p(
        'Enemies come in waves, each on a timer. The HUD counts down to the next one. A wave arrives on time even if the one before is still on the field, so waves can overlap.',
      ),
      p(
        `${TERMS.callNextWave} brings the next wave in now and restarts the timer. Use it when your defense is ready. You get no bonus for it.`,
      ),
      p(
        `With Tactical mode on in Settings, there are no timers. Each wave starts only when you press ${TERMS.startWave} on a clear field. A win in Tactical mode earns at most ${TACTICAL_MAX_STARS} stars.`,
      ),
    ),
    section(
      'Towers',
      list(BUILD_KINDS.map((k) => `${TOWER_NAMES[k]} (${formatFunds(TOWER_STATS[k].cost)}): ${TOWER_ROLES[k]}`)),
    ),
    section(
      'Enemies',
      list(
        PLAYABLE_KINDS.map((k) => {
          const { reward: base, leakCost } = ENEMY_STATS[k];
          return `${ENEMY_NAMES[k]} (reward ${reward(base)}; ${hq} −${leakCost}): ${ENEMY_WEAKNESS[k]}`;
        }),
      ),
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
