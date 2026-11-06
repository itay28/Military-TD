import { mountSpeedButtons, type GameSpeedControl } from '../scenes/gameSpeed';
import { isGameOver, type GameState } from '../sim/game';
import type { OpenFieldManual } from './fieldManual';
import { mountHelpOverlay, type HelpOverlay } from './helpOverlay';
import { shortcutFor } from './keymap';
import type { OpenSettings } from './settingsScreen';

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
  /** Called when the player presses Quit to menu. Without it, Quit is disabled. */
  readonly onQuit?: () => void;
  /** Opens the Settings screen in place of the Paused dialog. Without it, Settings is disabled. */
  readonly openSettings?: OpenSettings;
  /** Opens the Field manual in place of the Paused dialog (#408); the game stays paused. Without it, it is disabled. */
  readonly openFieldManual?: OpenFieldManual | undefined;
  /** The game speed. With it, the Paused dialog can change the speed, so the player resumes at the one they pick. */
  readonly speed?: GameSpeedControl;
}

export interface PauseMenu {
  /** Whether the game is paused: the scene feeds no time to the sim or the cosmetics then. */
  readonly paused: boolean;
  /** Opens the overlay. Does nothing once the game is over. */
  open(): void;
  /** Pauses and shows the Keys help overlay (the ?/H keys); Esc or Back then resumes. Does nothing once the game is over. */
  openHelp(): void;
  /** Closes the overlay, and the Settings screen or help overlay if one is open, and resumes. */
  close(): void;
  /** Keeps the Pause button and the overlay in step with the game; call once per frame. Writes only on a change. */
  update(): void;
  /** Removes the Pause button and the overlay, unblocks the page and stops listening for P and Esc. */
  destroy(): void;
}

const TITLE_ID = 'pause-menu-title';

/**
 * Builds the pause overlay inside `root`, over the canvas, and a Pause button in `buttonRoot`. P or Esc toggles it; a
 * keydown handler that uses an Esc for something else marks it with `preventDefault()`, and then it doesn't pause.
 * Pausing is a full freeze: the overlay covers the map and the `blocked` areas can't be used until Resume.
 */
export function mountPauseMenu(
  root: HTMLElement,
  game: PauseMenuGame,
  { buttonRoot, blocked, onRestart, onQuit, openSettings, openFieldManual, speed }: PauseMenuOptions,
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
    if (!paused) {
      closeSettings();
      closeHelp();
    }
    root.hidden = !paused;
    for (const area of blocked) area.inert = paused;
    if (paused) {
      speedButtons?.sync();
      resume.focus();
    }
  };
  const open = () => {
    if (!destroyed && !isGameOver(game.state.phase)) setPaused(true);
  };
  const close = () => setPaused(false);
  const closeHelp = () => {
    helpOverlay?.close();
    helpOverlay = undefined;
    dialog.hidden = false;
  };
  /** Shows the help overlay in place of the Paused dialog; `onBack` runs when the player leaves it. */
  const showHelp = (onBack: () => void) => {
    dialog.hidden = true;
    helpOverlay = mountHelpOverlay(helpRoot, {
      onBack: () => {
        helpOverlay = undefined;
        dialog.hidden = false;
        onBack();
      },
    });
  };
  const openHelp = () => {
    if (destroyed || isGameOver(game.state.phase) || helpOverlay) return;
    if (paused) closeSettings();
    else setPaused(true);
    // Opened from the game, Back returns to it.
    showHelp(close);
  };
  const closeSettings = () => {
    subScreen?.close();
    subScreen = undefined;
    dialog.hidden = false;
  };

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
  // Open, Settings or the Field manual takes the Paused dialog's place; the game stays paused, and Back brings the
  // dialog back.
  let subScreen: { back(): void; close(): void } | undefined;
  const subScreenButton = (
    testId: string,
    text: string,
    openScreen: ((onBack: () => void) => { back(): void; close(): void }) | undefined,
  ) => {
    const button: HTMLButtonElement = makeButton(
      testId,
      text,
      openScreen &&
        (() => {
          dialog.hidden = true;
          subScreen = openScreen(() => {
            subScreen = undefined;
            dialog.hidden = false;
            button.focus();
          });
        }),
    );
    return button;
  };
  const settings = subScreenButton('settings', 'Settings', openSettings);
  const fieldManual = subScreenButton('field-manual', 'Field manual', openFieldManual);
  // Opened from the Paused dialog, Back returns to it.
  let helpOverlay: HelpOverlay | undefined;
  const keys = makeButton('keys', 'Keys', () => showHelp(() => keys.focus()));
  dialog.append(
    heading,
    resume,
    makeButton('pause-restart', 'Restart', () => onRestart()),
    settings,
    fieldManual,
    keys,
    makeButton('quit', 'Quit to menu', onQuit && (() => onQuit())),
  );
  const helpRoot = doc.createElement('div');
  helpRoot.className = 'help';
  helpRoot.hidden = true;
  root.append(dialog, helpRoot);
  const speedButtons = speed && mountSpeedButtons(dialog, speed, (n) => `pause-speed-${n}`);
  // Between Resume and Restart.
  if (speedButtons) resume.after(speedButtons.group);
  root.hidden = true;

  // While paused, keys stop at the window, before the build bar's and tower panel's shortcuts see them: P/Esc resume.
  const swallowKeysWhilePaused = (event: KeyboardEvent) => {
    if (!paused) return;
    event.stopPropagation();
    if (shortcutFor(event) !== 'pause' || event.repeat) return;
    // From Settings, the Field manual or the help overlay, it goes back the way the player came rather than resuming.
    if (subScreen) subScreen.back();
    else if (helpOverlay) helpOverlay.back();
    else close();
  };
  // P/Esc pause last, so an Esc that cancelled something first (a tower selection, a build kind) doesn't also pause.
  const pauseOnEscape = (event: KeyboardEvent) => {
    if (shortcutFor(event) === 'pause' && !event.repeat && !event.defaultPrevented) open();
  };
  const win = doc.defaultView!;
  win.addEventListener('keydown', swallowKeysWhilePaused, true);
  win.addEventListener('keydown', pauseOnEscape);

  return {
    get paused() {
      return paused;
    },
    open,
    openHelp,
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
