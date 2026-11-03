import { GAME_SPEEDS } from '../scenes/gameSpeed';
import type { ProgressStore } from '../progress/progress';
import type { SettingsStore } from '../settings/settings';

export interface SettingsScreenOptions {
  /** Called when the player presses Back (or Esc), after the screen has closed. */
  readonly onBack: () => void;
  /** Saved progress, for Show hints again (#68), which clears its hints flag. No button without it. */
  readonly progress?: Pick<ProgressStore, 'setHintsDone'>;
}

export interface SettingsScreen {
  /** What Back does: closes the screen, then calls `onBack`. */
  back(): void;
  /** Takes the screen away without calling `onBack`, for an opener that is going away itself. */
  close(): void;
}

/** What the Main menu and the pause menu are given to open the Settings screen; Back returns to them through `onBack`. */
export type OpenSettings = (onBack: () => void) => SettingsScreen;

const TITLE_ID = 'settings-title';

/**
 * Builds the Settings screen inside `root`, a dialog over the whole page. It's a DOM form with labelled controls, so
 * tests can query it (ADR-0003). Each change goes into `settings` at once; there is nothing to apply or save here:
 * the store saves itself.
 */
export function mountSettingsScreen(
  root: HTMLElement,
  settings: SettingsStore,
  { onBack, progress }: SettingsScreenOptions,
): SettingsScreen {
  const doc = root.ownerDocument;
  const labelled = (input: HTMLInputElement, text: string) => {
    const label = doc.createElement('label');
    label.append(input, text);
    return label;
  };

  const speeds = doc.createElement('fieldset');
  const legend = doc.createElement('legend');
  legend.textContent = 'Default game speed';
  speeds.append(legend);
  const current = settings.get();
  for (const speed of GAME_SPEEDS) {
    const radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = 'default-speed';
    radio.value = String(speed);
    radio.checked = speed === current.defaultSpeed;
    radio.addEventListener('change', () => settings.set({ defaultSpeed: speed }));
    speeds.append(labelled(radio, `×${speed}`));
  }

  const showAllRanges = doc.createElement('input');
  showAllRanges.type = 'checkbox';
  showAllRanges.checked = current.showAllRanges;
  showAllRanges.addEventListener('change', () => settings.set({ showAllRanges: showAllRanges.checked }));

  // Show hints again: the first map's hints come back on its next game. A status line confirms it, the button stays.
  const hintControls: HTMLElement[] = [];
  if (progress) {
    const showHints = doc.createElement('button');
    showHints.type = 'button';
    showHints.textContent = 'Show hints again';
    showHints.className = 'show-hints';
    const note = doc.createElement('p');
    note.setAttribute('role', 'status');
    note.className = 'hints-note';
    showHints.addEventListener('click', () => {
      progress.setHintsDone(false);
      note.textContent = 'Hints will show on the first map.';
    });
    hintControls.push(showHints, note);
  }

  const backButton = doc.createElement('button');
  backButton.type = 'button';
  backButton.textContent = 'Back';

  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  heading.textContent = 'Settings';
  dialog.append(heading, speeds, labelled(showAllRanges, 'Always show tower ranges'), ...hintControls, backButton);
  root.append(dialog);
  root.hidden = false;
  speeds.querySelector<HTMLInputElement>('input:checked')?.focus();

  const win = doc.defaultView!;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    win.removeEventListener('keydown', backOnEscape);
    root.replaceChildren();
    root.hidden = true;
  };
  const back = () => {
    if (!open) return;
    close();
    onBack();
  };
  // The pause menu catches Esc before it gets here, and calls back() itself.
  function backOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.repeat) back();
  }
  win.addEventListener('keydown', backOnEscape);
  backButton.addEventListener('click', back);

  return { back, close };
}
