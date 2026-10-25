import { LAYER_NAME, TOWER_NAME } from '../data/display';
import type { Game } from '../sim/game';
import { waveDps } from '../sim/stats';

/** The parts of the Game the tower panel reads. */
export type TowerPanelGame = Pick<Game, 'state'>;

export interface TowerPanel {
  /** The selected tower's id, or undefined when none is. */
  readonly selectedId: number | undefined;
  /** Selects tower `id` and shows its panel, or with undefined deselects and hides it. */
  select(id: number | undefined): void;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. Deselects once the tower is gone. */
  update(): void;
  /** Removes the panel's elements and listeners and hides it; select() and update() do nothing after this. */
  destroy(): void;
}

const TITLE_ID = 'tower-panel-title';

/**
 * Builds the tower panel inside `root`, an overlay over the canvas. It owns the selection, which is UI state,
 * not a game rule. It's DOM, so tests can query it (ADR-0003).
 */
export function mountTowerPanel(root: HTMLElement, game: TowerPanelGame): TowerPanel {
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
  const level = doc.createElement('p');
  level.dataset.testid = 'tower-level';
  const list = doc.createElement('dl');
  const row = (label: string, testId: string) => {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.dataset.testid = testId;
    list.append(dt, dd);
    return dd;
  };
  const damage = row('Damage', 'tower-damage');
  const fireRate = row('Fire rate', 'tower-fire-rate');
  const range = row('Range', 'tower-range');
  const targets = row('Targets', 'tower-targets');
  const dps = row('Wave DPS', 'tower-wave-dps');
  const totalDamage = row('Total damage', 'tower-total-damage');
  const kills = row('Kills', 'tower-kills');
  dialog.append(heading, close, level, list);
  root.append(dialog);
  root.hidden = true;
  let selectedId: number | undefined;
  let destroyed = false;

  // Runs every frame, so it touches the DOM only when a value changed.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const setHidden = (hidden: boolean) => {
    if (root.hidden !== hidden) root.hidden = hidden;
  };

  const update = () => {
    if (destroyed) return;
    const { towers, stats } = game.state;
    const tower = towers.find((t) => t.id === selectedId);
    // Sold, or gone with a restart: nothing left to show.
    if (!tower) selectedId = undefined;
    setHidden(!tower);
    if (!tower) return;
    const figures = stats.towers[tower.id];
    setText(heading, TOWER_NAME[tower.kind]);
    setText(level, 'Level 1'); // Towers gain levels with upgrades (#55).
    setText(damage, String(tower.damage));
    setText(fireRate, `${tower.fireRate}/s`);
    setText(range, `${tower.range} tiles`);
    setText(targets, tower.targets.map((layer) => LAYER_NAME[layer]).join(', '));
    setText(dps, waveDps(figures?.wave.damage ?? 0, stats.wave.elapsedMs).toFixed(1));
    setText(totalDamage, String(figures?.total.damage ?? 0));
    setText(kills, String(figures?.total.kills ?? 0));
  };
  const select = (id: number | undefined) => {
    if (destroyed) return;
    selectedId = id;
    update();
  };
  const onClose = () => select(undefined);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selectedId !== undefined) select(undefined);
  };
  close.addEventListener('click', onClose);
  doc.addEventListener('keydown', onKeyDown);
  return {
    get selectedId() {
      return selectedId;
    },
    select,
    update,
    destroy() {
      destroyed = true;
      selectedId = undefined;
      close.removeEventListener('click', onClose);
      doc.removeEventListener('keydown', onKeyDown);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
