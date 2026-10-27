import { isGameOver, type GameState } from '../sim/game';

/** The parts of the Game the pause menu reads. */
export interface PauseMenuGame {
  readonly state: Pick<GameState, 'phase'>;
}

export interface PauseMenuOptions {
  /** Where the Pause button goes (`#hud`). */
  readonly buttonRoot: HTMLElement;
  /** The page areas the player can't use while paused (HUD, build bar, tower panel); they are made `inert`. */
  readonly blocked: readonly HTMLElement[];
  /** Called when the player presses Restart. */
  readonly onRestart: () => void;
  /** Called when the player presses Quit to menu. Without it, Quit is disabled: there is no menu yet (#46). */
  readonly onQuit?: () => void;
}

export interface PauseMenu {
  /** Whether the game is paused: the scene feeds no time to the sim or the cosmetics then. */
  readonly paused: boolean;
  /** Opens the overlay. Does nothing once the game is over. */
  open(): void;
  /** Closes the overlay and resumes. */
  close(): void;
  /** Keeps the Pause button and the overlay in step with the game; call once per frame. Writes only on a change. */
  update(): void;
  /** Removes the Pause button and the overlay, unblocks the page and stops listening for Esc. */
  destroy(): void;
}

const TITLE_ID = 'pause-menu-title';

/**
 * Builds the pause overlay inside `root`, over the canvas, and a Pause button in `buttonRoot`. Esc toggles it; a
 * keydown handler that uses an Esc for something else marks it with `preventDefault()`, and then it doesn't pause.
 * Pausing is a full freeze: the overlay covers the map and the `blocked` areas can't be used until Resume.
 */
export function mountPauseMenu(
  root: HTMLElement,
  game: PauseMenuGame,
  { buttonRoot, blocked, onRestart, onQuit }: PauseMenuOptions,
): PauseMenu {
  const doc = root.ownerDocument;
  const makeButton = (testId: string, text: string, onClick?: () => void) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.testid = testId;
    button.textContent = text;
    if (onClick) button.addEventListener('click', onClick);
    else button.disabled = true;
    return button;
  };

  let paused = false;
  let destroyed = false;
  const setPaused = (value: boolean) => {
    if (paused === value) return;
    paused = value;
    root.hidden = !paused;
    for (const area of blocked) area.inert = paused;
    if (paused) resume.focus();
  };
  const open = () => {
    if (!destroyed && !isGameOver(game.state.phase)) setPaused(true);
  };
  const close = () => setPaused(false);

  const pause = makeButton('pause', 'Pause', open);
  buttonRoot.append(pause);

  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  heading.textContent = 'Paused';
  const resume = makeButton('resume', 'Resume', close);
  dialog.append(
    heading,
    resume,
    makeButton('pause-restart', 'Restart', () => onRestart()),
    // Settings (#48) doesn't exist yet.
    makeButton('settings', 'Settings'),
    makeButton('quit', 'Quit to menu', onQuit && (() => onQuit())),
  );
  root.append(dialog);
  root.hidden = true;

  // While paused, keys stop at the window, before the build bar's and tower panel's shortcuts see them: Esc resumes.
  const swallowKeysWhilePaused = (event: KeyboardEvent) => {
    if (!paused) return;
    event.stopPropagation();
    if (event.key === 'Escape' && !event.repeat) close();
  };
  // Esc pauses last, so one that cancelled something first (a tower selection, a build kind) doesn't also pause.
  const pauseOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.repeat && !event.defaultPrevented) open();
  };
  const win = doc.defaultView!;
  win.addEventListener('keydown', swallowKeysWhilePaused, true);
  win.addEventListener('keydown', pauseOnEscape);

  return {
    get paused() {
      return paused;
    },
    open,
    close,
    update() {
      const over = isGameOver(game.state.phase);
      if (pause.disabled !== over) pause.disabled = over;
      if (over) close();
    },
    destroy() {
      close();
      destroyed = true;
      win.removeEventListener('keydown', swallowKeysWhilePaused, true);
      win.removeEventListener('keydown', pauseOnEscape);
      pause.remove();
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
