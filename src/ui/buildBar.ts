import { BUILD_BAR_COLUMNS, TOWER_NAMES, TOWER_STYLE } from '../data/display';
import { TOWER_STATS, type TowerKind } from '../data/towers';

/** One button on the build bar. */
export interface BuildOption<K extends string = TowerKind> {
  readonly kind: K;
  readonly name: string;
  readonly cost: number;
  /** Colours of the tower's square, as the scene draws it. */
  readonly icon: { readonly fill: number; readonly outline: number };
}

/** The parts of the Game the build bar reads. */
export interface BuildBarGame {
  readonly state: { readonly money: number };
}

export interface BuildBar<K extends string = TowerKind> {
  /** The kind a click on the map places. */
  readonly selected: K;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the bar's elements and stops listening for hotkeys. */
  destroy(): void;
}

/** One option per tower kind, in `TOWER_STATS` order, so a kind added there shows up on the bar. */
export function buildOptions(): BuildOption[] {
  return (Object.keys(TOWER_STATS) as TowerKind[]).map((kind) => ({
    kind,
    name: TOWER_NAMES[kind],
    cost: TOWER_STATS[kind].cost,
    icon: { fill: TOWER_STYLE[kind].fill, outline: TOWER_STYLE[kind].outline },
  }));
}

const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Builds the build bar inside `root`: one button per option, the first selected. A click or the option's number
 * key (`1`…`n`) selects it, unless the player can't afford it. It's DOM, so tests can query it (ADR-0003).
 */
export function mountBuildBar<K extends string>(
  root: HTMLElement,
  game: BuildBarGame,
  options: readonly BuildOption<K>[],
): BuildBar<K> {
  const first = options[0];
  if (!first) throw new Error('The build bar needs at least one tower kind');
  const doc = root.ownerDocument;
  const grid = doc.createElement('div');
  grid.className = 'build-grid';
  grid.style.gridTemplateColumns = `repeat(${BUILD_BAR_COLUMNS}, 1fr)`;
  root.append(grid);

  const buttons = options.map((option, i) => {
    const hotkey = String(i + 1);
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.testid = `build-${option.kind}`;
    button.setAttribute('aria-label', option.name);
    button.title = `${option.name} (${hotkey}): ${option.cost}`;
    const icon = doc.createElement('span');
    icon.className = 'build-icon';
    icon.style.backgroundColor = cssColor(option.icon.fill);
    icon.style.borderColor = cssColor(option.icon.outline);
    const cost = doc.createElement('span');
    cost.className = 'build-cost';
    cost.textContent = String(option.cost);
    const key = doc.createElement('kbd');
    key.textContent = hotkey;
    button.append(icon, cost, key);
    button.addEventListener('click', () => select(option));
    grid.append(button);
    return button;
  });

  let selected = first;
  const affordable = (option: BuildOption<K>) => game.state.money >= option.cost;
  const select = (option: BuildOption<K>) => {
    if (!affordable(option)) return;
    selected = option;
    update();
  };

  // Runs every frame, so it touches the DOM only when a value changed.
  const update = () => {
    options.forEach((option, i) => {
      const button = buttons[i]!;
      const disabled = !affordable(option);
      if (button.disabled !== disabled) button.disabled = disabled;
      const pressed = String(option === selected);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const option = /^[1-9]$/.test(event.key) ? options[Number(event.key) - 1] : undefined;
    if (option) select(option);
  };
  doc.addEventListener('keydown', onKey);

  update();
  return {
    get selected() {
      return selected.kind;
    },
    update,
    destroy() {
      doc.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
