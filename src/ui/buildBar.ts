import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE, formatFunds } from '../data/display';
import { renderFor, type RenderedSprite } from '../data/renders';
import { towerIcon, type TowerIcon } from '../data/sprites';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { shortcutFor } from './keymap';
import { placeTip, towerTooltip, type Rect, type TowerTooltip } from './towerTooltip';

/** One button on the build bar. */
export interface BuildOption<K extends string = TowerKind> {
  readonly kind: K;
  readonly name: string;
  readonly cost: number;
  /** Colours, shape and size of the tower, as the scene draws it. */
  readonly icon: {
    readonly fill: number;
    readonly outline: number;
    readonly shape: 'square' | 'circle';
    readonly size: number;
  };
  /** The tower's sprite layers: shown instead of the shape when the atlas has the frames. */
  readonly sprite?: TowerIcon;
  /** The tower's render (hull and turret images, turret facing north): wins over `sprite`, as it does on the map. */
  readonly render?: RenderIcon;
  /** What the button's tooltip says: shown on hover, on focus and while the kind is selected. */
  readonly tooltip?: TowerTooltip;
}

/** What the build bar needs of a render: the two image URLs and the square canvas they share, in pixels. */
export type RenderIcon = Pick<RenderedSprite, 'hullUrl' | 'turretUrl' | 'canvasPx'>;

/** The atlas as the page sees it: the image's URL and each frame's rectangle in it, or null for an absent frame. */
export interface IconAtlas {
  readonly url: string;
  frame(name: string): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null;
}

/** The parts of the Game the build bar reads. */
export interface BuildBarGame {
  readonly state: { readonly money: number };
}

export interface BuildBar<K extends string = TowerKind> {
  /** The kind a click on the map places, or undefined when none is: then a click on the map builds nothing. */
  readonly selected: K | undefined;
  /** Whether the bar is folded down to its toggle, leaving the map more room. */
  readonly collapsed: boolean;
  /** Drops the selected kind, if any. */
  clear(): void;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** The page rect of the map tile under the pointer or finger, which a tooltip must not cover; undefined for none. */
  avoid(rect: Rect | undefined): void;
  /** Removes the bar's elements and stops listening for hotkeys. */
  destroy(): void;
}

function buildKinds(): TowerKind[] {
  return Object.keys(TOWER_STATS) as TowerKind[];
}

/** A kind's 1-based place on the build bar, which is also its hotkey. */
export function buildBarNumber(kind: TowerKind): number {
  return buildKinds().indexOf(kind) + 1;
}

/**
 * One option per tower kind, in `TOWER_STATS` order, so a kind added there shows up on the bar. A kind with a render
 * gets its icon from it, unless `renderLoaded` says its textures didn't (then Kenney, as the map does).
 */
export function buildOptions(renderLoaded: (render: RenderedSprite) => boolean = () => true): BuildOption[] {
  return buildKinds().map((kind) => {
    const { fill, outline, shape, size } = TOWER_STYLE[kind];
    const rendered = renderFor(kind);
    const render = rendered !== null && renderLoaded(rendered) ? rendered : null;
    const sprite = render ? null : towerIcon(kind);
    return {
      kind,
      name: TOWER_NAMES[kind],
      cost: TOWER_STATS[kind].cost,
      icon: { fill, outline, shape, size },
      tooltip: towerTooltip(kind),
      ...(render
        ? { render: { hullUrl: render.hullUrl, turretUrl: render.turretUrl, canvasPx: render.canvasPx } }
        : {}),
      ...(sprite ? { sprite } : {}),
    };
  });
}

/** Pixels of the icon box in `index.html`; the largest tower fills it. */
const ICON_BOX = 24;

const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** The base and turret layers of a sprite icon, each scaled to fill the icon's `box` (so smaller towers keep their size ratio); null when the atlas lacks a frame. */
function spriteLayers(doc: Document, atlas: IconAtlas, sprite: TowerIcon, box: number): HTMLElement[] | null {
  const frames = [
    { name: sprite.base, rotation: 0 },
    { name: sprite.turret, rotation: sprite.turretRotation },
  ].map(({ name, rotation }) => ({ rect: atlas.frame(name), rotation }));
  if (frames.some(({ rect }) => rect === null)) return null;
  return frames.map(({ rect, rotation }) => {
    const { x, y, w, h } = rect!;
    const layer = doc.createElement('span');
    layer.className = 'build-icon-layer';
    layer.style.cssText =
      `position:absolute;left:50%;top:50%;width:${w}px;height:${h}px;background-repeat:no-repeat;` +
      `background-image:url("${atlas.url}");background-position:-${x}px -${y}px;image-rendering:pixelated;`;
    // Fit the frame's longer side to the box, turned about its centre.
    layer.style.transform = `translate(-50%,-50%) scale(${box / Math.max(w, h)}) rotate(${(rotation * 180) / Math.PI}deg)`;
    return layer;
  });
}

/** The hull and turret images of a render icon, the canvas fitted to the icon's `box`; the turret already faces north. */
function renderLayers(doc: Document, render: RenderIcon, box: number): HTMLElement[] {
  return [render.hullUrl, render.turretUrl].map((url) => {
    const layer = doc.createElement('span');
    layer.className = 'build-icon-layer';
    layer.style.cssText =
      `position:absolute;left:50%;top:50%;width:${render.canvasPx}px;height:${render.canvasPx}px;background-repeat:no-repeat;` +
      `background-image:url("${url}");background-size:100% 100%;`;
    layer.style.transform = `translate(-50%,-50%) scale(${box / render.canvasPx})`;
    return layer;
  });
}

/** A hidden `role="tooltip"` for one button: the name and hotkey, the role line, then the stat rows. */
function tooltipElement(doc: Document, kind: string, hotkey: string, tooltip: TowerTooltip): HTMLElement {
  const tip = doc.createElement('div');
  tip.id = `build-tip-${kind}`;
  tip.dataset.testid = `build-tip-${kind}`;
  tip.className = 'build-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const title = doc.createElement('strong');
  title.textContent = `${tooltip.name} [${hotkey}]`;
  const role = doc.createElement('p');
  role.textContent = tooltip.role;
  const list = doc.createElement('dl');
  for (const { label, value } of tooltip.rows) {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  tip.append(title, role, list);
  return tip;
}

/**
 * Builds the build bar inside `root`: a collapse toggle, then one button per option, none selected. A click or the
 * option's number key (`1`…`n`) selects it, unless the player can't afford it; a click on the selected one, or
 * Escape, clears it. It's DOM, so tests can query it (ADR-0003).
 */
export function mountBuildBar<K extends string>(
  root: HTMLElement,
  game: BuildBarGame,
  options: readonly BuildOption<K>[],
  /** `onSelect` runs when a kind becomes selected (not when it is cleared), so the scene can close the tower panel. `atlas` supplies the sprite icons. */
  { onSelect, atlas }: { readonly onSelect?: () => void; readonly atlas?: IconAtlas | undefined } = {},
): BuildBar<K> {
  if (options.length === 0) throw new Error('The build bar needs at least one tower kind');
  const doc = root.ownerDocument;
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'build-toggle';
  toggle.dataset.testid = 'build-bar-toggle';
  toggle.setAttribute('aria-label', 'Build bar');
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  const grid = doc.createElement('div');
  grid.className = 'build-grid';
  grid.style.gridTemplateColumns = `repeat(${BUILD_BAR_COLUMNS}, 1fr)`;
  root.append(toggle, grid);

  let collapsed = false;
  let mounted = false;
  const setCollapsed = (value: boolean) => {
    collapsed = value;
    grid.hidden = value;
    if (mounted) update(); // hides the tooltip with the buttons
    root.dataset.collapsed = String(value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.textContent = value ? '◀' : '▶';
    toggle.title = value ? 'Show the build bar' : 'Hide the build bar';
  };
  setCollapsed(false);

  const largest = Math.max(...options.map((option) => option.icon.size));
  let pointerFocus = false;
  const entries = options.map((option, i) => {
    const hotkey = String(i + 1);
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.testid = `build-${option.kind}`;
    // Name and cost, as the tower panel names its buttons ("Optics ($40)"), so a screen reader hears the price.
    button.setAttribute('aria-label', `${option.name} (${formatFunds(option.cost)})`);
    const tip = option.tooltip && tooltipElement(doc, option.kind, hotkey, option.tooltip);
    if (tip) button.setAttribute('aria-describedby', tip.id);
    else button.title = `${option.name} (${hotkey}): ${formatFunds(option.cost)}`;
    const icon = doc.createElement('span');
    icon.className = 'build-icon';
    const box = (ICON_BOX * option.icon.size) / largest;
    icon.style.width = `${box}px`;
    icon.style.height = `${box}px`;
    const layers = option.render
      ? renderLayers(doc, option.render, box)
      : atlas && option.sprite
        ? spriteLayers(doc, atlas, option.sprite, box)
        : null;
    if (layers) {
      icon.style.border = 'none';
      icon.append(...layers);
    } else {
      icon.style.backgroundColor = cssColor(option.icon.fill);
      icon.style.borderColor = cssColor(option.icon.outline);
      if (option.icon.shape === 'circle') icon.style.borderRadius = '50%';
    }
    const cost = doc.createElement('span');
    cost.className = 'build-cost';
    cost.textContent = formatFunds(option.cost);
    const key = doc.createElement('kbd');
    key.textContent = hotkey;
    button.append(icon, cost, key);
    button.addEventListener('click', () => (option === selected ? clear() : select(option)));
    // A finger has no hover: touch shows the tooltip through the selection instead, so a tap that clears it hides it.
    button.addEventListener('pointerenter', (event) => event.pointerType !== 'touch' && setHovered(option));
    button.addEventListener('pointerleave', () => hovered === option && setHovered(undefined));
    // Only keyboard focus: a click or tap focuses the button too, and must not keep its tooltip up once cleared.
    button.addEventListener('pointerdown', () => (pointerFocus = true));
    button.addEventListener('focus', () => {
      if (!pointerFocus) setFocused(option);
      pointerFocus = false;
    });
    button.addEventListener('blur', () => focused === option && setFocused(undefined));
    grid.append(button);
    if (tip) root.append(tip);
    return { option, button, tip };
  });

  // Hover wins over focus, and focus over the selected kind: touch has no hover, so a selected kind shows its own.
  let hovered: BuildOption<K> | undefined;
  let focused: BuildOption<K> | undefined;
  let avoid: Rect | undefined;
  const setHovered = (option: BuildOption<K> | undefined) => {
    hovered = option;
    update();
  };
  const setFocused = (option: BuildOption<K> | undefined) => {
    focused = option;
    update();
  };
  const showTip = (entry: (typeof entries)[number] | undefined) => {
    for (const { tip } of entries) if (tip && tip !== entry?.tip && !tip.hidden) tip.hidden = true;
    const tip = entry?.tip;
    if (!tip) return;
    if (tip.hidden) tip.hidden = false;
    const view = doc.defaultView;
    const at = placeTip(
      entry.button.getBoundingClientRect(),
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
      avoid,
    );
    const left = `${at.left}px`;
    const top = `${at.top}px`;
    if (tip.style.left !== left) tip.style.left = left;
    if (tip.style.top !== top) tip.style.top = top;
  };

  let selected: BuildOption<K> | undefined;
  const affordable = (option: BuildOption<K>) => game.state.money >= option.cost;
  const select = (option: BuildOption<K>) => {
    if (!affordable(option)) return;
    selected = option;
    update();
    onSelect?.();
  };
  const clear = () => {
    selected = undefined;
    update();
  };

  // Runs every frame, so it touches the DOM only when a value changed.
  const update = () => {
    for (const { option, button } of entries) {
      const unaffordable = !affordable(option);
      // The selected kind stays clickable when Money runs short, so a click on it can still clear it.
      const disabled = unaffordable && option !== selected;
      if (button.disabled !== disabled) button.disabled = disabled;
      if (button.hasAttribute('aria-disabled') !== unaffordable) {
        if (unaffordable) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
      const pressed = String(option === selected);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
    const shown = collapsed ? undefined : (hovered ?? focused ?? selected);
    showTip(entries.find((entry) => entry.option === shown));
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (!selected) return;
      event.preventDefault(); // handled: it doesn't also pause (pauseMenu.ts)
      return clear();
    }
    const option = shortcutFor(event) === 'build' ? options[Number(event.key) - 1] : undefined;
    if (option) select(option);
  };
  doc.addEventListener('keydown', onKey);

  mounted = true;
  update();
  return {
    get selected() {
      return selected?.kind;
    },
    get collapsed() {
      return collapsed;
    },
    clear,
    update,
    avoid(rect) {
      avoid = rect;
    },
    destroy() {
      doc.removeEventListener('keydown', onKey);
      root.replaceChildren();
      delete root.dataset.collapsed;
    },
  };
}
