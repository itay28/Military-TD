/**
 * The first-map onboarding hints (#68): three callouts that teach placing a tower, starting a wave and opening the
 * tower panel. Each waits on its action, not a timer. The sequence is pure (`hintFor`); `mountHints` only draws one.
 */

/** A hint on screen: at the build bar, at Start Wave, or at a placed tower. */
export type HintId = 'place' | 'startWave' | 'selectTower';

/** What the player did, as the Game scene sees it each frame. */
export type HintEvent = 'towerPlaced' | 'waveStarted' | 'waveCleared' | 'towerPanelOpened' | 'skipped';

/** Which of the hinted actions have happened. Only ever goes from false to true. */
export interface HintState {
  readonly placed: boolean;
  readonly started: boolean;
  readonly cleared: boolean;
  /** The tower panel opened after the first wave was cleared; an earlier opening doesn't count. */
  readonly inspected: boolean;
  readonly skipped: boolean;
}

export const INITIAL_HINTS: HintState = {
  placed: false,
  started: false,
  cleared: false,
  inspected: false,
  skipped: false,
};

export interface HintResult {
  readonly state: HintState;
  /** The hint to show now; undefined between hints (the first wave running) and once done. */
  readonly hint: HintId | undefined;
  /** True once all three are over, finished or skipped: the flag to save. */
  readonly done: boolean;
}

export const HINT_TEXT: Readonly<Record<HintId, string>> = {
  place: 'Pick a tower, then tap a tile beside the road',
  startWave: 'Press Start Wave when you are ready',
  selectTower: 'Select a tower to upgrade or sell it',
};

function apply(state: HintState, event: HintEvent): HintState {
  switch (event) {
    case 'towerPlaced':
      return { ...state, placed: true };
    case 'waveStarted':
      return { ...state, started: true };
    case 'waveCleared':
      return { ...state, cleared: true };
    case 'towerPanelOpened':
      return state.cleared ? { ...state, inspected: true } : state;
    case 'skipped':
      return { ...state, skipped: true };
  }
}

/** Folds this frame's `events` into `state`, in order, and says which hint to show. */
export function hintFor(state: HintState, events: readonly HintEvent[]): HintResult {
  const next = events.reduce(apply, state);
  const done = next.skipped || next.inspected;
  let hint: HintId | undefined;
  if (!done) {
    if (!next.placed && !next.started) hint = 'place';
    else if (!next.started) hint = 'startWave';
    else if (next.cleared) hint = 'selectTower';
  }
  return { state: next, hint, done };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CalloutPlacement {
  readonly left: number;
  readonly top: number;
  /** Where the callout sits from its anchor; its arrow points the other way. */
  readonly side: 'below' | 'above' | 'left';
  /** The arrow's x inside the callout, under the anchor's centre (below and above only). */
  readonly arrowX: number;
}

/** Space kept from the viewport's edges. */
const MARGIN = 8;
/** Space between the anchor and the callout, where the arrow goes. */
const GAP = 10;

/**
 * Where a callout of `size` goes to point at `anchor`, all in viewport pixels: left of a tall anchor (the build bar
 * down the right edge), else below it, else above it, always inside the viewport with a margin (#68: fits 400 px).
 */
export function placeCallout(anchor: Rect, size: Size, viewport: Size): CalloutPlacement {
  const clamp = (value: number, max: number) => Math.max(MARGIN, Math.min(value, max - MARGIN));
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const clampTop = (top: number) => clamp(top, viewport.height - size.height);
  const tall = anchor.height > viewport.height / 2;
  if (tall && anchor.left - GAP - size.width >= MARGIN) {
    return { left: anchor.left - GAP - size.width, top: clampTop(centerY - size.height / 2), side: 'left', arrowX: 0 };
  }
  const left = clamp(centerX - size.width / 2, viewport.width - size.width);
  const below = anchor.top + anchor.height + GAP;
  const side = below + size.height <= viewport.height - MARGIN ? 'below' : 'above';
  const top = clampTop(side === 'below' ? below : anchor.top - GAP - size.height);
  return { left, top, side, arrowX: centerX - left };
}

export interface Hints {
  /** Shows `hint` pointing at `anchor` (viewport pixels), moving the callout when either changes. */
  show(hint: HintId, anchor: Rect): void;
  hide(): void;
  /** Empties and hides the root; show() does nothing after this. */
  destroy(): void;
}

/**
 * Builds the hint callout inside `root`, a layer over the whole page (`#hints`). It's DOM, so tests can query it
 * (ADR-0003). Only its Skip hints button takes the pointer: the layer never blocks the game, and it has no keys
 * (Esc keeps cancelling and pausing).
 */
export function mountHints(root: HTMLElement, { onSkip }: { readonly onSkip: () => void }): Hints {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const callout = doc.createElement('div');
  callout.setAttribute('role', 'status');
  callout.className = 'hint';
  const text = doc.createElement('p');
  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.textContent = 'Skip hints';
  skip.addEventListener('click', onSkip);
  callout.append(text, skip);
  root.append(callout);
  root.hidden = true;

  let destroyed = false;
  let shown: HintId | undefined;
  let lastKey = '';
  return {
    show(hint, anchor) {
      if (destroyed) return;
      if (hint !== shown) {
        shown = hint;
        text.textContent = HINT_TEXT[hint];
        callout.dataset.hint = hint;
      }
      root.hidden = false;
      const { width, height } = callout.getBoundingClientRect();
      const viewport = { width: win.innerWidth, height: win.innerHeight };
      const placed = placeCallout(anchor, { width, height }, viewport);
      const key = `${hint}:${placed.left}:${placed.top}:${placed.side}:${placed.arrowX}`;
      if (key === lastKey) return;
      lastKey = key;
      callout.style.left = `${Math.round(placed.left)}px`;
      callout.style.top = `${Math.round(placed.top)}px`;
      callout.style.setProperty('--arrow-x', `${Math.round(placed.arrowX)}px`);
      callout.dataset.side = placed.side;
    },
    hide() {
      root.hidden = true;
    },
    destroy() {
      destroyed = true;
      skip.removeEventListener('click', onSkip);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
