import { DPS_METER_NARROW_PX, DPS_METER_REFRESH_MS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import type { TowerKind } from '../data/towers';
import { dpsBreakdown, meterElapsedMs, type DpsKindRow, type DpsScope, type DpsTowerRow } from '../sim/dps';
import type { GameState } from '../sim/game';
import type { Tower } from '../sim/towers';

/** The parts of the Game the DPS meter reads. */
export interface DpsMeterGame {
  readonly state: Pick<GameState, 'stats' | 'phase'> & {
    readonly towers: readonly Pick<Tower, 'id' | 'level' | 'dismantleMs'>[];
  };
}

export interface DpsMeterOptions {
  /** Real time in ms, for the refresh limit. Default `performance.now()`. */
  readonly now?: () => number;
  /** Whether the screen is narrow, so kinds start collapsed. Default: the window is under `DPS_METER_NARROW_PX`. */
  readonly narrow?: () => boolean;
  /** Runs when a tower row is clicked: the scene selects that tower. A sold tower's row can't be clicked. */
  readonly onSelectTower?: (towerId: number) => void;
  /** Runs when the highlighted kind changes (undefined: none), so the scene can outline that kind's towers. */
  readonly onHighlightKind?: (kind: TowerKind | undefined) => void;
}

export interface DpsMeter {
  readonly open: boolean;
  /** The kind whose towers are highlighted on the map, if any. At most one. */
  readonly highlightedKind: TowerKind | undefined;
  /** Opens or closes the panel; it redraws at once when it opens. */
  toggle(): void;
  /** Redraws from `game.state` while open, at most every `DPS_METER_REFRESH_MS`. Call once per frame. */
  update(): void;
  destroy(): void;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const kills = (n: number) => plural(n, 'kill');
const dpsText = (dps: number) => `${Math.round(dps)} DPS`;

const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
const setHidden = (el: HTMLElement, hidden: boolean) => {
  if (el.hidden !== hidden) el.hidden = hidden;
};
const setAttr = (el: HTMLElement, name: string, value: string) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};
/** Puts `children` in `parent` in this order, moving nodes only when the order changed. */
const order = (parent: HTMLElement, children: readonly HTMLElement[]) => {
  const current = [...parent.children];
  if (current.length !== children.length || children.some((child, i) => current[i] !== child))
    parent.replaceChildren(...children);
};

interface TowerView {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
}

interface KindView {
  readonly el: HTMLElement;
  readonly highlight: HTMLButtonElement;
  readonly toggle: HTMLButtonElement;
  readonly dps: HTMLElement;
  readonly kills: HTMLElement;
  readonly share: HTMLElement;
  readonly bar: HTMLElement;
  readonly list: HTMLElement;
  readonly towers: Map<number, TowerView>;
}

/**
 * The DPS meter (GLOSSARY): a panel, under the HUD at the map's top-left corner, that breaks the DPS down by tower kind
 * and, under each kind, by tower. DOM, so tests can query it (ADR-0003). Closed until the HUD's DPS figure opens it.
 */
export function mountDpsMeter(root: HTMLElement, game: DpsMeterGame, options: DpsMeterOptions = {}): DpsMeter {
  const doc = root.ownerDocument;
  const now = options.now ?? (() => performance.now());
  const narrow =
    options.narrow ?? (() => (doc.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY) < DPS_METER_NARROW_PX);
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testId?: string) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (testId) el.dataset.testid = testId;
    return el;
  };

  const panel = make('section', 'dps-meter', 'dps-meter');
  panel.id = 'dps-meter';
  panel.setAttribute('aria-label', 'DPS meter');
  panel.hidden = true;
  const scopes = make('div', 'dps-scope');
  scopes.setAttribute('role', 'group');
  scopes.setAttribute('aria-label', 'DPS figures');
  const scopeButton = (scope: DpsScope, label: string) => {
    const button = make('button', 'dps-scope-button', `dps-scope-${scope}`);
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      current = scope;
      draw();
    });
    scopes.append(button);
    return button;
  };
  const scopeButtons = { wave: scopeButton('wave', 'This wave'), total: scopeButton('total', 'Whole game') };
  const empty = make('p', 'dps-empty', 'dps-empty');
  empty.textContent = 'No towers yet';
  const kindList = make('ul', 'dps-kinds');
  panel.append(scopes, empty, kindList);
  root.append(panel);

  let open = false;
  let current: DpsScope = 'wave';
  /** Real time of the last redraw; the first update after opening always draws. */
  let drawnAtMs = Number.NEGATIVE_INFINITY;
  const kindViews = new Map<TowerKind, KindView>();
  let highlightedKind: TowerKind | undefined;
  const highlightKind = (kind: TowerKind | undefined) => {
    if (kind === highlightedKind) return;
    highlightedKind = kind;
    for (const [k, view] of kindViews) setAttr(view.highlight, 'aria-pressed', String(k === kind));
    options.onHighlightKind?.(kind);
  };
  // Esc clears the highlight, and doesn't also pause (pauseMenu.ts) or close the tower panel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || highlightedKind === undefined) return;
    event.preventDefault();
    highlightKind(undefined);
  };
  doc.addEventListener('keydown', onKeyDown);

  const kindView = (kind: TowerKind): KindView => {
    const existing = kindViews.get(kind);
    if (existing) return existing;
    const el = make('li', 'dps-kind', `dps-kind-${kind}`);
    el.dataset.kind = kind;
    const head = make('div', 'dps-kind-head');
    const highlight = make('button', 'dps-kind-row', `dps-kind-highlight-${kind}`);
    highlight.type = 'button';
    highlight.setAttribute('aria-label', `Highlight all ${TOWER_NAMES[kind]}s`);
    highlight.setAttribute('aria-pressed', String(highlightedKind === kind));
    const toggle = make('button', 'dps-kind-expand', `dps-kind-toggle-${kind}`);
    toggle.type = 'button';
    toggle.setAttribute('aria-label', `Show ${TOWER_NAMES[kind]} towers`);
    toggle.setAttribute('aria-controls', `dps-towers-${kind}`);
    const swatch = make('span', 'dps-swatch', `dps-kind-swatch-${kind}`);
    const style = TOWER_STYLE[kind];
    swatch.dataset.shape = style.shape;
    swatch.style.backgroundColor = hex(style.fill);
    swatch.style.borderColor = hex(style.outline);
    const name = make('span', 'dps-name', `dps-kind-name-${kind}`);
    name.textContent = TOWER_NAMES[kind];
    const dps = make('span', 'dps-value', `dps-kind-dps-${kind}`);
    const killCount = make('span', 'dps-kills', `dps-kind-kills-${kind}`);
    const share = make('span', 'dps-share', `dps-kind-share-${kind}`);
    const track = make('span', 'dps-bar');
    const bar = make('span', 'dps-bar-fill', `dps-kind-bar-${kind}`);
    track.append(bar);
    highlight.append(swatch, name, dps, killCount, share, track);
    head.append(highlight, toggle);
    const list = make('ul', 'dps-towers', `dps-towers-${kind}`);
    list.id = `dps-towers-${kind}`;
    const view: KindView = { el, highlight, toggle, dps, kills: killCount, share, bar, list, towers: new Map() };
    const expand = (expanded: boolean) => {
      toggle.setAttribute('aria-expanded', String(expanded));
      list.hidden = !expanded;
    };
    expand(!narrow());
    toggle.addEventListener('click', () => expand(toggle.getAttribute('aria-expanded') !== 'true'));
    highlight.addEventListener('click', () => highlightKind(highlightedKind === kind ? undefined : kind));
    el.append(head, list);
    kindViews.set(kind, view);
    return view;
  };

  const towerView = (kind: KindView, row: DpsTowerRow): TowerView => {
    const existing = kind.towers.get(row.towerId);
    if (existing) return existing;
    const el = make('li', 'dps-tower', `dps-tower-${row.towerId}`);
    el.dataset.towerId = String(row.towerId);
    const button = make('button', 'dps-tower-button', `dps-tower-button-${row.towerId}`);
    button.type = 'button';
    button.addEventListener('click', () => options.onSelectTower?.(row.towerId));
    el.append(button);
    const view = { el, button };
    kind.towers.set(row.towerId, view);
    return view;
  };

  const drawKind = (row: DpsKindRow): HTMLElement => {
    const view = kindView(row.kind);
    setText(view.dps, dpsText(row.dps));
    setText(view.kills, kills(row.kills));
    setText(view.share, `${Math.round(row.share * 100)}%`);
    const width = `${+(row.share * 100).toFixed(1)}%`;
    if (view.bar.style.width !== width) view.bar.style.width = width;
    const shown = new Set(row.towers.map((t) => t.towerId));
    for (const id of view.towers.keys()) if (!shown.has(id)) view.towers.delete(id);
    const towerEls = row.towers.map((tower) => {
      const { el, button } = towerView(view, tower);
      const label = tower.sold ? 'sold' : `Lv ${tower.level}`;
      setText(button, `#${tower.towerId} ${label} · ${dpsText(tower.dps)} · ${kills(tower.kills)}`);
      setAttr(button, 'aria-label', `Select ${TOWER_NAMES[row.kind]} #${tower.towerId}`);
      if (button.disabled !== tower.sold) button.disabled = tower.sold;
      setAttr(el, 'data-sold', String(tower.sold));
      return el;
    });
    order(view.list, towerEls);
    return view.el;
  };

  const draw = () => {
    drawnAtMs = now();
    for (const [scope, button] of Object.entries(scopeButtons))
      setAttr(button, 'aria-pressed', String(scope === current));
    const { stats, towers } = game.state;
    const elapsedMs = meterElapsedMs(stats, current);
    const { kinds } = dpsBreakdown(stats, towers, elapsedMs, current);
    setHidden(empty, kinds.length > 0);
    const shown = new Set(kinds.map((k) => k.kind));
    for (const kind of kindViews.keys()) if (!shown.has(kind)) kindViews.delete(kind);
    if (highlightedKind !== undefined && !shown.has(highlightedKind)) highlightKind(undefined);
    for (const [kind, view] of kindViews) setAttr(view.highlight, 'aria-pressed', String(kind === highlightedKind));
    order(kindList, kinds.map(drawKind));
  };

  return {
    get open() {
      return open;
    },
    get highlightedKind() {
      return highlightedKind;
    },
    toggle() {
      open = !open;
      panel.hidden = !open;
      if (open) draw();
      else highlightKind(undefined);
    },
    update() {
      if (open && now() - drawnAtMs >= DPS_METER_REFRESH_MS) draw();
    },
    destroy() {
      doc.removeEventListener('keydown', onKeyDown);
      highlightKind(undefined);
      panel.remove();
    },
  };
}
