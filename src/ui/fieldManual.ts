import { FACTION_NAMES, FIELD_MANUAL } from '../data/display';
import type { EnemyKind } from '../data/enemies';
import { fieldManualEntries, type FieldManualEntry } from '../data/fieldManual';
import { modelFor, type ModelView } from '../data/modelViews';
import type { Progress } from '../progress/progress';
import { FACTIONS, type Faction } from '../sim/factions';

export interface FieldManualOptions {
  /** Called when the player presses Back (or Esc), after the screen has closed. */
  readonly onBack: () => void;
  /** Saved progress: an enemy kind not in `metEnemies` stays classified. */
  readonly progress: { get(): Pick<Progress, 'metEnemies'> };
  /** Reduced motion: the model doesn't spin on its own (the arrow keys, buttons and drag still turn it). */
  readonly reducedMotion?: boolean;
  /** Schedules the next spin step; `requestAnimationFrame` by default. */
  readonly requestFrame?: (step: (timeMs: number) => void) => unknown;
  readonly cancelFrame?: (handle: unknown) => void;
  /** The images of each model; `modelFor` (the render files) by default. */
  readonly models?: (faction: Faction, kind: FieldManualEntry['kind']) => ModelView;
}

export interface FieldManual {
  /** What Back does: closes the screen, then calls `onBack`. */
  back(): void;
  /** Takes the screen away without calling `onBack`, for an opener that is going away itself. */
  close(): void;
}

/** What the Main menu and the pause menu are given to open the Field manual; Back returns to them through `onBack`. */
export type OpenFieldManual = (onBack: () => void) => FieldManual;

const TITLE_ID = 'field-manual-title';
const CLASSIFIED = 'Classified';

const mod = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Builds the Field manual inside `root`, a dialog over the whole page: every tower and enemy kind, its model turning
 * on one side and its information on the other. DOM, so tests can query it (ADR-0003). Models load when an entry
 * opens: the turntable sheet if there is one, else (or when it fails) the top-down render, turned in 2D.
 */
export function mountFieldManual(
  root: HTMLElement,
  {
    onBack,
    progress,
    reducedMotion = false,
    requestFrame = (step) => root.ownerDocument.defaultView!.requestAnimationFrame(step),
    cancelFrame = (handle) => root.ownerDocument.defaultView!.cancelAnimationFrame(handle as number),
    models = modelFor,
  }: FieldManualOptions,
): FieldManual {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  };
  const makeButton = (text: string, onClick: () => void) => {
    const b = el('button', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  const entries = fieldManualEntries();
  const met = new Set<string>(progress.get().metEnemies);
  const isClassified = (entry: FieldManualEntry) => entry.group === 'enemy' && !met.has(entry.kind as EnemyKind);

  // The list: towers, then enemies, one button each.
  const list = el('nav', undefined, 'fm-list');
  list.setAttribute('aria-label', 'Entries');
  const entryButtons: HTMLButtonElement[] = [];
  for (const [group, label] of [
    ['tower', 'Towers'],
    ['enemy', 'Enemies'],
  ] as const) {
    const ul = el('ul');
    for (const entry of entries.filter((e) => e.group === group)) {
      const index = entries.indexOf(entry);
      const b = makeButton(isClassified(entry) ? CLASSIFIED : entry.name, () => select(index));
      entryButtons[index] = b;
      const li = el('li');
      li.append(b);
      ul.append(li);
    }
    list.append(el('h3', label), ul);
  }

  // The model, its rotate buttons and the faction switcher.
  const modelEl = el('div', undefined, 'fm-model');
  modelEl.setAttribute('role', 'img');
  modelEl.tabIndex = 0;
  const placeholder = el('p', 'Loading model…', 'fm-loading');
  const rotateLeft = makeButton('Rotate left', () => turnBy(-FIELD_MANUAL.keyStepDeg));
  const rotateRight = makeButton('Rotate right', () => turnBy(FIELD_MANUAL.keyStepDeg));
  const rotate = el('div', undefined, 'fm-rotate');
  rotate.append(rotateLeft, rotateRight);
  const factions = el('div', undefined, 'fm-factions');
  factions.setAttribute('role', 'group');
  factions.setAttribute('aria-label', 'Faction');
  const factionButtons = FACTIONS.map((f) => {
    const b = makeButton(FACTION_NAMES[f], () => {
      faction = f;
      showModel();
    });
    factions.append(b);
    return b;
  });
  const view = el('section', undefined, 'fm-view');
  view.append(modelEl, rotate, factions);

  const info = el('section', undefined, 'fm-info');
  info.setAttribute('aria-live', 'polite');

  const title = el('h2', 'Field manual');
  title.id = TITLE_ID;
  const body = el('div', undefined, 'fm-body');
  body.append(list, view, info);
  const backButton = makeButton('Back', () => back());
  const dialog = el('div', undefined, 'fm');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  dialog.append(title, body, backButton);
  root.append(dialog);
  root.hidden = false;

  let selected = 0;
  let faction: Faction = 'us';
  let angle = 0;
  let closed = false;
  // The current images: a turntable sheet (with its layout) or the top-down layers.
  let sheet: ModelView['turntable'];
  let images: HTMLImageElement[] = [];

  const draw = () => {
    modelEl.dataset.angle = String(Math.round(angle));
    if (sheet) {
      const frame = Math.round(angle / (360 / sheet.frames)) % sheet.frames;
      const rows = Math.ceil(sheet.frames / sheet.columns);
      modelEl.dataset.frame = String(frame);
      images[0]!.style.transform = `translate(${(-(frame % sheet.columns) * 100) / sheet.columns}%, ${
        (-Math.floor(frame / sheet.columns) * 100) / rows
      }%)`;
    } else {
      delete modelEl.dataset.frame;
      for (const img of images) img.style.transform = `rotate(${angle}deg)`;
    }
  };

  /** Puts `urls` in the model box, with the placeholder until every one has loaded. */
  const load = (urls: readonly string[], onError: () => void) => {
    for (const img of images) img.remove();
    images = urls.map((url) => {
      const img = el('img');
      img.alt = '';
      img.draggable = false;
      img.src = url;
      return img;
    });
    let pending = images.length;
    placeholder.textContent = pending ? 'Loading model…' : 'No picture';
    placeholder.hidden = false;
    for (const img of images) {
      img.addEventListener('load', () => {
        if (images.includes(img) && --pending === 0) placeholder.hidden = true;
      });
      img.addEventListener('error', () => {
        if (images.includes(img)) onError();
      });
    }
    modelEl.replaceChildren(placeholder, ...images);
  };

  const showModel = () => {
    const entry = entries[selected]!;
    const classified = isClassified(entry);
    modelEl.classList.toggle('classified', classified);
    factions.hidden = classified;
    factionButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(FACTIONS[i] === faction)));
    modelEl.setAttribute(
      'aria-label',
      classified ? 'Unknown enemy, classified' : `${entry.name}, ${FACTION_NAMES[faction]} model`,
    );
    const model = models(faction, entry.kind);
    const fallback = () => {
      sheet = undefined;
      modelEl.classList.remove('fm-turntable');
      load(model.layers, () => {
        placeholder.textContent = 'No picture';
        placeholder.hidden = false;
      });
      draw();
    };
    if (model.turntable) {
      sheet = model.turntable;
      modelEl.classList.add('fm-turntable');
      load([sheet.url], fallback);
      images[0]!.style.width = `${sheet.columns * 100}%`;
      draw();
    } else fallback();
  };

  const showInfo = () => {
    const entry = entries[selected]!;
    if (isClassified(entry)) {
      info.replaceChildren(el('h3', CLASSIFIED), el('p', 'CLASSIFIED: no contact yet', 'fm-classified'));
      return;
    }
    const dl = el('dl');
    for (const [label, value] of entry.stats) dl.append(el('dt', label), el('dd', value));
    const counters = (label: string, kinds: readonly string[]) => {
      const p = el('p', undefined, 'fm-counters');
      p.append(el('strong', `${label}: `), kinds.length ? kinds.join(', ') : 'none');
      return p;
    };
    info.replaceChildren(
      el('h3', entry.name),
      el('p', entry.classLine, 'fm-class'),
      el('p', entry.role, 'role'),
      dl,
      counters(entry.effectiveLabel, entry.effective),
      counters(entry.weakLabel, entry.weak),
    );
  };

  function select(index: number) {
    selected = index;
    entryButtons.forEach((b, i) => {
      if (i === index) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    showInfo();
    showModel();
  }

  // Spinning on its own until the player turns it.
  let frameHandle: unknown;
  let lastMs: number | undefined;
  let spinning = !reducedMotion;
  const step = (timeMs: number) => {
    if (closed || !spinning) return;
    if (lastMs !== undefined) {
      angle = mod(angle + ((timeMs - lastMs) / 1000) * FIELD_MANUAL.spinDegPerS);
      draw();
    }
    lastMs = timeMs;
    frameHandle = requestFrame(step);
  };
  const stopSpin = () => {
    if (!spinning) return;
    spinning = false;
    cancelFrame(frameHandle);
  };
  const turnBy = (deg: number) => {
    stopSpin();
    angle = mod(angle + deg);
    draw();
  };

  // Drag to turn, mouse or touch.
  let dragX: number | undefined;
  let dragId: number | undefined;
  modelEl.addEventListener('pointerdown', (event) => {
    dragX = event.clientX;
    dragId = event.pointerId;
    try {
      modelEl.setPointerCapture(event.pointerId);
    } catch {
      // Not every pointer can be captured (a synthetic one): the drag still works over the model.
    }
  });
  modelEl.addEventListener('pointermove', (event) => {
    if (dragX === undefined || event.pointerId !== dragId) return;
    turnBy((event.clientX - dragX) * FIELD_MANUAL.dragDegPerPx);
    dragX = event.clientX;
  });
  const endDrag = () => {
    dragX = dragId = undefined;
  };
  modelEl.addEventListener('pointerup', endDrag);
  modelEl.addEventListener('pointercancel', endDrag);

  // Keys on the capture phase, so they work over the pause menu, which stops keys at the window while paused.
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as Node | null;
    if (!target || !root.contains(target)) return;
    const index = entryButtons.indexOf(target as HTMLButtonElement);
    let next: number | undefined;
    if (index >= 0) {
      if (event.key === 'ArrowDown') next = Math.min(index + 1, entries.length - 1);
      else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = entries.length - 1;
    }
    if (next !== undefined) {
      event.preventDefault();
      select(next);
      entryButtons[next]!.focus();
      return;
    }
    if (target === modelEl && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      turnBy(event.key === 'ArrowLeft' ? -FIELD_MANUAL.keyStepDeg : FIELD_MANUAL.keyStepDeg);
    }
  };
  const backOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.repeat) back();
  };
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('keydown', backOnEscape);

  const close = () => {
    if (closed) return;
    closed = true;
    stopSpin();
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('keydown', backOnEscape);
    root.replaceChildren();
    root.hidden = true;
  };
  function back() {
    if (closed) return;
    close();
    onBack();
  }

  select(0);
  entryButtons[0]!.focus();
  if (spinning) frameHandle = requestFrame(step);
  return { back, close };
}
