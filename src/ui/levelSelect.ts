import { TERMS, lockedLine } from '../data/display';
import type { MapEntry } from '../data/maps';
import type { Stars } from '../sim/progression';
import { buildBriefing } from './briefing';
import { TACTICAL_CAP_TEXT } from './endScreen';
import { buildMapCard } from './mapCard';

/** What the Level select shows of one map: whether it can be picked, and its best Stars so far. */
export interface MapStatus {
  readonly unlocked: boolean;
  readonly bestStars: Stars;
}

const OPEN: MapStatus = { unlocked: true, bestStars: 0 };

export interface LevelSelectOptions {
  /** The page's `#app`: marked `data-screen="level-select"` while this shows, which hides the game's UI. */
  readonly app: HTMLElement;
  /** The maps to offer, in order. */
  readonly maps: readonly MapEntry[];
  /** Called with a map's id when the player deploys from its briefing. */
  readonly onPick: (id: string) => void;
  /** The map at this index's status; a locked one can't be picked. By default every map is unlocked, with no stars. */
  readonly statusOf?: (mapIndex: number) => MapStatus;
  /** Called when the player presses Back. */
  readonly onBack: () => void;
  /** Tactical mode is on in the settings: the screen says wins earn at most 2 stars (ADR-0011). */
  readonly tacticalMode?: boolean;
}

export interface LevelSelect {
  /** Removes the screen's elements, hides it and shows the game's UI again; its buttons do nothing after this. */
  destroy(): void;
}

/** "★★☆", or "Locked: complete <the map before>": hidden from screen readers, which hear the button's name instead. */
function buildStatus(doc: Document, { unlocked, bestStars }: MapStatus, previous: MapEntry | undefined): HTMLElement {
  const line = doc.createElement('span');
  line.setAttribute('aria-hidden', 'true');
  if (unlocked) {
    line.dataset.testid = 'stars';
    line.className = 'stars';
    line.textContent = '★'.repeat(bestStars) + '☆'.repeat(3 - bestStars);
  } else {
    line.dataset.testid = 'locked';
    line.className = 'locked';
    line.textContent = lockedLine(previous?.name);
  }
  return line;
}

/** "Map, 2 of 3 stars", "Map, no stars yet", or "Map, locked. Complete <the map before> to unlock". */
function accessibleName(name: string, { unlocked, bestStars }: MapStatus, previous: MapEntry | undefined): string {
  if (!unlocked) return `${name}, locked. Complete ${previous?.name ?? 'the map before'} to unlock`;
  return bestStars === 0 ? `${name}, no stars yet` : `${name}, ${bestStars} of 3 stars`;
}

/**
 * Builds the Level select inside `root`: one button per map, with its aerial card, name and best Stars (or "Locked" and
 * `aria-disabled` while locked), then Back. Focus starts on the last unlocked map. Picking an unlocked map swaps the
 * cards for its briefing (#401), whose Deploy calls `onPick`; its Back or Escape returns to the cards. DOM (ADR-0003).
 */
export function mountLevelSelect(
  root: HTMLElement,
  { app, maps, onPick, onBack, statusOf = () => OPEN, tacticalMode = false }: LevelSelectOptions,
): LevelSelect {
  const doc = root.ownerDocument;
  let live = true;
  const title = doc.createElement('h1');
  title.textContent = TERMS.levelSelect;
  const back = doc.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  back.addEventListener('click', () => live && onBack());
  const list = doc.createElement('ul');
  let briefing: { panel: HTMLElement; card: HTMLButtonElement } | undefined;
  const closeBriefing = () => {
    if (!briefing) return;
    const { panel, card } = briefing;
    briefing = undefined;
    panel.remove();
    list.hidden = false;
    back.hidden = false;
    card.focus();
  };
  const openBriefing = (entry: MapEntry, card: HTMLButtonElement) => {
    const panel = buildBriefing(doc, entry, {
      onDeploy: () => live && onPick(entry.id),
      onBack: () => live && closeBriefing(),
    });
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.repeat && live) closeBriefing();
    });
    list.hidden = true;
    back.hidden = true;
    back.before(panel);
    briefing = { panel, card };
    panel.querySelector<HTMLButtonElement>('button.deploy')?.focus();
  };
  const mapButtons = maps.map((entry, index) => {
    const { name } = entry;
    const status = statusOf(index);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'map';
    // aria-disabled rather than disabled: a locked map stays focusable, so a screen reader hears what unlocks it.
    if (!status.unlocked) button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-label', accessibleName(name, status, maps[index - 1]));
    const label = doc.createElement('span');
    label.textContent = name;
    button.append(buildMapCard(doc, entry), label, buildStatus(doc, status, maps[index - 1]));
    button.addEventListener('click', () => live && status.unlocked && openBriefing(entry, button));
    const item = doc.createElement('li');
    item.append(button);
    list.append(item);
    return button;
  });
  root.append(title);
  if (tacticalMode) {
    const cap = doc.createElement('p');
    cap.dataset.testid = 'tactical-cap';
    cap.textContent = TACTICAL_CAP_TEXT;
    root.append(cap);
  }
  root.append(list, back);
  root.hidden = false;
  app.dataset.screen = 'level-select';
  mapButtons.findLast((button) => !button.hasAttribute('aria-disabled'))?.focus();
  return {
    destroy() {
      live = false;
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
