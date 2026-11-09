// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HINT_TEXT,
  hintFor,
  INITIAL_HINTS,
  mountHints,
  placeCallout,
  type HintEvent,
  type HintState,
  type Hints,
} from './hints';

/** Folds `batches` of events one after the other, as one frame each, and returns the last result. */
const run = (...batches: readonly HintEvent[][]) => {
  let state: HintState = INITIAL_HINTS;
  let result = hintFor(state, []);
  for (const events of batches) {
    result = hintFor(state, events);
    state = result.state;
  }
  return result;
};

describe('hintFor', () => {
  it('starts on the build bar hint', () => {
    expect(hintFor(INITIAL_HINTS, [])).toEqual({ state: INITIAL_HINTS, hint: 'place', done: false });
  });

  it('walks place → start wave → (wait for the clear) → select a tower, then is done', () => {
    expect(run(['towerPlaced']).hint).toBe('startWave');
    expect(run(['towerPlaced'], ['waveStarted'])).toMatchObject({ hint: undefined, done: false });
    expect(run(['towerPlaced'], ['waveStarted'], ['waveCleared']).hint).toBe('selectTower');
    expect(run(['towerPlaced'], ['waveStarted'], ['waveCleared'], ['towerPanelOpened'])).toMatchObject({
      hint: undefined,
      done: true,
    });
  });

  it('keeps a hint up until its own action, whatever else happens', () => {
    expect(run(['towerPanelOpened']).hint).toBe('place');
    expect(run(['towerPlaced'], ['towerPanelOpened']).hint).toBe('startWave');
  });

  it('skips a step whose action came early: a wave started before any tower', () => {
    expect(run(['waveStarted'], ['towerPlaced'])).toMatchObject({ hint: undefined, done: false });
  });

  it('counts the tower panel only once the first wave is cleared', () => {
    expect(run(['towerPlaced'], ['towerPanelOpened'], ['waveStarted'], ['waveCleared']).hint).toBe('selectTower');
  });

  it('ends every hint on a skip, at any step', () => {
    expect(run(['skipped'])).toMatchObject({ hint: undefined, done: true });
    expect(run(['towerPlaced'], ['waveStarted'], ['waveCleared'], ['skipped'])).toMatchObject({
      hint: undefined,
      done: true,
    });
  });

  it('applies the events of one frame in order', () => {
    expect(run(['towerPlaced', 'waveStarted', 'waveCleared', 'towerPanelOpened']).done).toBe(true);
  });

  it('does not change the state it is given', () => {
    const state = { ...INITIAL_HINTS };
    hintFor(state, ['towerPlaced', 'skipped']);
    expect(state).toEqual(INITIAL_HINTS);
  });

  it('has the text of each hint', () => {
    expect(HINT_TEXT.place).toBe('Pick a tower, then tap a tile beside the road');
    expect(HINT_TEXT.selectTower).toBe('Select a tower to upgrade or sell it');
    expect(HINT_TEXT.startWave).toMatch(/Start Wave/);
  });
});

describe('placeCallout', () => {
  const viewport = { width: 400, height: 700 };
  const size = { width: 220, height: 60 };

  it('goes below an anchor near the top, centred on it', () => {
    const anchor = { left: 150, top: 10, width: 100, height: 30 };
    expect(placeCallout(anchor, size, viewport)).toEqual({ left: 90, top: 50, side: 'below', arrowX: 110 });
  });

  it('goes above an anchor with no room below', () => {
    const anchor = { left: 150, top: 640, width: 100, height: 40 };
    expect(placeCallout(anchor, size, viewport)).toMatchObject({ top: 570, side: 'above' });
  });

  it('stays inside the viewport with a margin, the arrow still on the anchor', () => {
    const anchor = { left: 370, top: 10, width: 30, height: 30 };
    const placed = placeCallout(anchor, size, viewport);
    expect(placed.left).toBe(400 - 8 - 220);
    expect(placed.left + placed.arrowX).toBe(385);
  });

  it('goes left of a tall anchor along the right edge', () => {
    const anchor = { left: 330, top: 50, width: 70, height: 600 };
    expect(placeCallout(anchor, size, viewport)).toEqual({ left: 100, top: 320, side: 'left', arrowX: 0 });
  });

  it('never leaves the left or top margin, even for a callout wider than the screen', () => {
    const placed = placeCallout({ left: 0, top: 0, width: 10, height: 10 }, { width: 500, height: 60 }, viewport);
    expect(placed.left).toBe(8);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });
});

describe('mountHints', () => {
  let root: HTMLElement;
  let hints: Hints;
  const onSkip = vi.fn();
  const callout = () => root.querySelector<HTMLElement>('[role="status"]');
  const skip = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Skip hints');
  const anchor = { left: 100, top: 10, width: 80, height: 30 };

  beforeEach(() => {
    document.body.innerHTML = '<div id="hints" hidden></div>';
    root = document.getElementById('hints')!;
    onSkip.mockReset();
    hints = mountHints(root, { onSkip });
  });
  afterEach(() => hints.destroy());

  it('shows nothing until a hint is shown', () => {
    expect(root.hidden).toBe(true);
  });

  it('shows the hint text by its anchor, with Skip hints', () => {
    hints.show('place', anchor);
    expect(root.hidden).toBe(false);
    expect(callout()?.textContent).toContain(HINT_TEXT.place);
    expect(callout()?.dataset.hint).toBe('place');
    expect(callout()?.style.left).toMatch(/px$/);
    expect(skip()).toBeDefined();
  });

  it('changes the text for the next hint, and hides', () => {
    hints.show('place', anchor);
    hints.show('startWave', anchor);
    expect(callout()?.textContent).toContain(HINT_TEXT.startWave);
    hints.hide();
    expect(root.hidden).toBe(true);
  });

  it('calls onSkip from Skip hints', () => {
    hints.show('place', anchor);
    skip()!.click();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('leaves Esc alone: it does not skip', () => {
    hints.show('place', anchor);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onSkip).not.toHaveBeenCalled();
    expect(root.hidden).toBe(false);
  });

  it('empties its root on destroy', () => {
    hints.show('place', anchor);
    hints.destroy();
    expect(root.childElementCount).toBe(0);
    expect(root.hidden).toBe(true);
    hints.show('place', anchor);
    expect(root.hidden).toBe(true);
  });
});
