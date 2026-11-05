import { ENEMY_NAMES, ENEMY_WEAKNESS, LAYER_NAME } from '../data/display';
import type { Game } from '../sim/game';

/** The parts of the Game the enemy card reads. */
export type EnemyCardGame = Pick<Game, 'state'>;

export interface EnemyCard {
  /** The id of the enemy the card shows (the pinned one, else the hovered one), or undefined when it is closed. */
  readonly shownId: number | undefined;
  /** The enemy a tap opened the card for, which stays shown until closed. */
  readonly pinnedId: number | undefined;
  /** Opens the card for enemy `id` until it is closed, or with undefined closes it. */
  pin(id: number | undefined): void;
  /** The enemy under a hovering mouse, shown while nothing is pinned; undefined when the mouse is over none. */
  hover(id: number | undefined): void;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. Closes once the enemy is gone. */
  update(): void;
  /** Removes the card's elements and listeners and hides it; nothing else does anything after this. */
  destroy(): void;
}

const TITLE_ID = 'enemy-card-title';

/**
 * Builds the enemy card inside `root`, an overlay over the canvas: what an enemy on the field is, and what hurts it.
 * What it shows is UI state, not a game rule. It's DOM, so tests can query it (ADR-0003).
 */
export function mountEnemyCard(
  root: HTMLElement,
  game: EnemyCardGame,
  /** `onPin` runs when an enemy gets pinned (not on close), so the scene can close the tower panel. */
  { onPin }: { readonly onPin?: () => void } = {},
): EnemyCard {
  const doc = root.ownerDocument;
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  const close = doc.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const list = doc.createElement('dl');
  const row = (label: string, testId: string) => {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.dataset.testid = testId;
    list.append(dt, dd);
    return dd;
  };
  const hp = row('HP', 'enemy-hp');
  const armor = row('Armor', 'enemy-armor');
  const layer = row('Layer', 'enemy-layer');
  const speed = row('Speed', 'enemy-speed');
  const weakness = doc.createElement('p');
  weakness.dataset.testid = 'enemy-weakness';
  weakness.className = 'role';
  dialog.append(heading, close, list, weakness);
  root.append(dialog);
  root.hidden = true;
  let pinnedId: number | undefined;
  let hoveredId: number | undefined;
  let shownId: number | undefined;
  let destroyed = false;

  // Runs every frame, so it touches the DOM only when a value changed.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };

  const update = () => {
    if (destroyed) return;
    const { enemies } = game.state;
    // Killed or leaked: nothing left to show.
    if (pinnedId !== undefined && !enemies.some((e) => e.id === pinnedId)) pinnedId = undefined;
    if (hoveredId !== undefined && !enemies.some((e) => e.id === hoveredId)) hoveredId = undefined;
    shownId = pinnedId ?? hoveredId;
    const enemy = enemies.find((e) => e.id === shownId);
    if (root.hidden !== !enemy) root.hidden = !enemy;
    if (!enemy) return;
    setText(heading, ENEMY_NAMES[enemy.kind]);
    setText(hp, `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`);
    setText(armor, String(enemy.armor));
    setText(layer, LAYER_NAME[enemy.layer]);
    setText(speed, `${enemy.speed} tiles/s`);
    setText(weakness, ENEMY_WEAKNESS[enemy.kind]);
  };
  const pin = (id: number | undefined) => {
    if (destroyed) return;
    pinnedId = id;
    update();
    if (id !== undefined) onPin?.();
  };
  const onClose = () => pin(undefined);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || pinnedId === undefined) return;
    event.preventDefault(); // handled: it doesn't also pause (pauseMenu.ts)
    pin(undefined);
  };
  close.addEventListener('click', onClose);
  doc.addEventListener('keydown', onKeyDown);
  return {
    get shownId() {
      return shownId;
    },
    get pinnedId() {
      return pinnedId;
    },
    pin,
    hover(id) {
      if (destroyed || id === hoveredId) return;
      hoveredId = id;
      update();
    },
    update,
    destroy() {
      destroyed = true;
      pinnedId = hoveredId = shownId = undefined;
      close.removeEventListener('click', onClose);
      doc.removeEventListener('keydown', onKeyDown);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
