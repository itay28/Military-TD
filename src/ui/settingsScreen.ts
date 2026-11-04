import { GAME_SPEEDS } from '../scenes/gameSpeed';
import { MAX_VOLUME, type SettingsStore, type VolumeField } from '../settings/settings';

export interface SettingsScreenOptions {
  /** Called when the player presses Back (or Esc), after the screen has closed. */
  readonly onBack: () => void;
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

/** Each volume slider's label, in the order they appear (#67). */
const VOLUME_SLIDERS: readonly { field: VolumeField; label: string; id: string }[] = [
  { field: 'masterVolume', label: 'Master volume', id: 'volume-master' },
  { field: 'musicVolume', label: 'Music volume', id: 'volume-music' },
  { field: 'sfxVolume', label: 'Sound effects volume', id: 'volume-sfx' },
];
/** The slider moves in steps of 5; the arrow keys step it, Home and End go to 0 and 100. */
const VOLUME_STEP = 5;

/**
 * Builds the Settings screen inside `root`, a dialog over the whole page. It's a DOM form with labelled controls, so
 * tests can query it (ADR-0003). Each change goes into `settings` at once; there is nothing to apply or save here:
 * the store saves itself.
 */
export function mountSettingsScreen(
  root: HTMLElement,
  settings: SettingsStore,
  { onBack }: SettingsScreenOptions,
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

  const volumes = VOLUME_SLIDERS.map(({ field, label, id }) => {
    const row = doc.createElement('div');
    row.className = 'volume';
    const name = doc.createElement('label');
    name.htmlFor = id;
    name.textContent = label;
    const slider = doc.createElement('input');
    slider.type = 'range';
    slider.id = id;
    slider.min = '0';
    slider.max = String(MAX_VOLUME);
    slider.step = String(VOLUME_STEP);
    const shown = doc.createElement('output');
    shown.setAttribute('for', id);
    // The slider announces its value itself (aria-valuetext); the output is for the eye, so it isn't read twice.
    shown.setAttribute('aria-hidden', 'true');
    const show = (value: number) => {
      slider.value = String(value);
      slider.setAttribute('aria-valuetext', `${value}%`);
      shown.textContent = `${value}%`;
    };
    show(current[field]);
    // `input` fires while dragging and on each key press, so the change is heard (and saved) at once.
    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      settings.set({ [field]: value });
      show(value);
    });
    row.append(name, slider, shown);
    return row;
  });

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
  dialog.append(heading, speeds, labelled(showAllRanges, 'Always show tower ranges'), ...volumes, backButton);
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
