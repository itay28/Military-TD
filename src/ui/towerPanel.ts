import { LAYER_NAME, LEVEL_NAME, TOWER_NAMES, UPGRADE_REFUSAL_TEXT } from '../data/display';
import type { Game } from '../sim/game';
import { waveDps } from '../sim/stats';
import { nextLevel } from '../sim/towers';

/** The parts of the Game the tower panel reads, and the upgrade command its button gives. */
export type TowerPanelGame = Pick<Game, 'state' | 'upgradeTower' | 'canUpgradeTower' | 'sellTower' | 'canSellTower'>;

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
  const upgrade = doc.createElement('button');
  upgrade.type = 'button';
  upgrade.dataset.testid = 'tower-upgrade';
  const sell = doc.createElement('button');
  sell.type = 'button';
  sell.dataset.testid = 'tower-sell';
  dialog.append(heading, close, level, list, upgrade, sell);
  root.append(dialog);
  root.hidden = true;
  let selectedId: number | undefined;
  let destroyed = false;

  // Runs every frame, so it touches the DOM only when a value changed.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const setHidden = (el: HTMLElement, hidden: boolean) => {
    if (el.hidden !== hidden) el.hidden = hidden;
  };

  const update = () => {
    if (destroyed) return;
    const { towers, stats } = game.state;
    const tower = towers.find((t) => t.id === selectedId);
    // Sold, or gone with a restart: nothing left to show.
    if (!tower) selectedId = undefined;
    setHidden(root, !tower);
    if (!tower) return;
    const figures = stats.towers[tower.id];
    setText(heading, TOWER_NAMES[tower.kind]);
    setText(level, `Level ${tower.level}`);
    setText(damage, String(tower.damage));
    setText(fireRate, `${Number(tower.fireRate.toFixed(2))}/s`);
    setText(range, `${tower.range} tiles`);
    setText(targets, tower.targets.map((layer) => LAYER_NAME[layer]).join(', '));
    setText(dps, waveDps(figures?.wave.damage ?? 0, stats.wave.elapsedMs).toFixed(1));
    setText(totalDamage, String(figures?.total.damage ?? 0));
    setText(kills, String(figures?.total.kills ?? 0));
    // The sim decides what selling pays and whether it is allowed (not while already dismantling).
    const sale = game.canSellTower(tower.id);
    setText(sell, sale.ok ? `Sell (+${sale.refund})` : sale.reason === 'dismantling' ? 'Dismantling…' : 'Sell');
    if (sell.disabled === sale.ok) sell.disabled = !sale.ok;
    // The sim decides whether the upgrade is allowed; the panel only names it and shows why not.
    const next = nextLevel(tower);
    setHidden(upgrade, !next);
    if (!next) return;
    setText(upgrade, `${LEVEL_NAME[tower.level + 1]} (${next.cost})`);
    const allowed = game.canUpgradeTower(tower.id);
    if (upgrade.disabled === allowed.ok) upgrade.disabled = !allowed.ok;
    const reason = allowed.ok ? '' : UPGRADE_REFUSAL_TEXT[allowed.reason];
    if (upgrade.title !== reason) upgrade.title = reason;
  };
  const select = (id: number | undefined) => {
    if (destroyed) return;
    selectedId = id;
    update();
  };
  const onClose = () => select(undefined);
  const onUpgrade = () => {
    if (selectedId === undefined) return;
    game.upgradeTower(selectedId);
    update();
  };
  const onSell = () => {
    if (selectedId === undefined) return;
    game.sellTower(selectedId);
    update(); // now dismantling; the panel closes once the tower is gone
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selectedId !== undefined) select(undefined);
  };
  close.addEventListener('click', onClose);
  upgrade.addEventListener('click', onUpgrade);
  sell.addEventListener('click', onSell);
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
      upgrade.removeEventListener('click', onUpgrade);
      sell.removeEventListener('click', onSell);
      doc.removeEventListener('keydown', onKeyDown);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
