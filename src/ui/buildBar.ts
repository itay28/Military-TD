import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';

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
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the bar's elements and stops listening for hotkeys. */
  destroy(): void;
}

/** One option per tower kind, in `TOWER_STATS` order, so a kind added there shows up on the bar. */
export function buildOptions(): BuildOption[] {
  return (Object.keys(TOWER_STATS) as TowerKind[]).map((kind) => {
    const { fill, outline, shape, size } = TOWER_STYLE[kind];
    return {
      kind,
      name: TOWER_NAMES[kind],
      cost: TOWER_STATS[kind].cost,
      icon: { fill, outline, shape, size },
    };
  });
}

/** Pixels of the icon box in `index.html`; the largest tower fills it. */
const ICON_BOX = 24;

const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Builds the build bar inside `root`: a collapse toggle, then one button per option, none selected. A click or the
 * option's number key (`1`…`n`) selects it, unless the player can't afford it; a click on the selected one, or
 * Escape, clears it. It's DOM, so tests can query it (ADR-0003).
 */
export function mountBuildBar<K extends string>(
  root: HTMLElement,
  game: BuildBarGame,
  options: readonly BuildOption<K>[],
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
  const setCollapsed = (value: boolean) => {
    collapsed = value;
    grid.hidden = value;
    root.dataset.collapsed = String(value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.textContent = value ? '◀' : '▶';
    toggle.title = value ? 'Show the build bar' : 'Hide the build bar';
  };
  setCollapsed(false);

  const largest = Math.max(...options.map((option) => option.icon.size));
  const entries = options.map((option, i) => {
    const hotkey = String(i + 1);
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.testid = `build-${option.kind}`;
    // Name and cost, as the tower panel names its buttons ("Optics (40)"), so a screen reader hears the price.
    button.setAttribute('aria-label', `${option.name} (${option.cost})`);
    button.title = `${option.name} (${hotkey}): ${option.cost}`;
    const icon = doc.createElement('span');
    icon.className = 'build-icon';
    icon.style.backgroundColor = cssColor(option.icon.fill);
    icon.style.borderColor = cssColor(option.icon.outline);
    const side = `${(ICON_BOX * option.icon.size) / largest}px`;
    icon.style.width = side;
    icon.style.height = side;
    if (option.icon.shape === 'circle') icon.style.borderRadius = '50%';
    const cost = doc.createElement('span');
    cost.className = 'build-cost';
    cost.textContent = String(option.cost);
    const key = doc.createElement('kbd');
    key.textContent = hotkey;
    button.append(icon, cost, key);
    button.addEventListener('click', () => (option === selected ? clear() : select(option)));
    grid.append(button);
    return { option, button };
  });

  let selected: BuildOption<K> | undefined;
  const affordable = (option: BuildOption<K>) => game.state.money >= option.cost;
  const select = (option: BuildOption<K>) => {
    if (!affordable(option)) return;
    selected = option;
    update();
  };
  const clear = () => {
    selected = undefined;
    update();
  };

  // Runs every frame, so it touches the DOM only when a value changed.
  const update = () => {
    for (const { option, button } of entries) {
      const disabled = !affordable(option);
      if (button.disabled !== disabled) button.disabled = disabled;
      const pressed = String(option === selected);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (!selected) return;
      event.preventDefault(); // handled: it doesn't also pause (pauseMenu.ts)
      return clear();
    }
    const option = /^[1-9]$/.test(event.key) ? options[Number(event.key) - 1] : undefined;
    if (option) select(option);
  };
  doc.addEventListener('keydown', onKey);

  update();
  return {
    get selected() {
      return selected?.kind;
    },
    get collapsed() {
      return collapsed;
    },
    update,
    destroy() {
      doc.removeEventListener('keydown', onKey);
      root.replaceChildren();
      delete root.dataset.collapsed;
    },
  };
}
