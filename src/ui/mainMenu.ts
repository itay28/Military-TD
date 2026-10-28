import type { OpenSettings, SettingsScreen } from './settingsScreen';

export interface MainMenuOptions {
  /** The page's `#app`: marked `data-screen="menu"` while the menu shows, which hides the HUD, build bar and tower panel. */
  readonly app: HTMLElement;
  /** Called when the player presses Play. */
  readonly onPlay: () => void;
  /** Called when the player presses Credits. */
  readonly onCredits: () => void;
  /** The button to focus: Play when the menu opens, Credits when coming back from the Credits screen. */
  readonly initialFocus?: 'play' | 'credits';
  /** Opens the Settings screen over the menu. Without it, Settings is disabled. */
  readonly openSettings?: OpenSettings;
}

export interface MainMenu {
  /** Closes an open Settings screen, removes the menu's elements, hides it and shows the game's UI again; Play does nothing after this. */
  destroy(): void;
}

/** Builds the Main menu inside `root`, a screen over the whole page. It's DOM, so tests can query it (ADR-0003). */
export function mountMainMenu(
  root: HTMLElement,
  { app, onPlay, onCredits, openSettings, initialFocus = 'play' }: MainMenuOptions,
): MainMenu {
  const doc = root.ownerDocument;
  const title = doc.createElement('h1');
  title.textContent = 'Military TD';
  const play = doc.createElement('button');
  play.type = 'button';
  play.textContent = 'Play';
  const onClick = () => onPlay();
  play.addEventListener('click', onClick);
  const settings = doc.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Settings';
  // Open, the Settings screen covers the menu, which goes inert behind it until Back.
  let settingsScreen: SettingsScreen | undefined;
  const onSettings = () => {
    if (!openSettings) return;
    root.inert = true;
    settingsScreen = openSettings(() => {
      settingsScreen = undefined;
      root.inert = false;
      settings.focus();
    });
  };
  if (openSettings) settings.addEventListener('click', onSettings);
  else settings.disabled = true;
  const credits = doc.createElement('button');
  credits.type = 'button';
  credits.textContent = 'Credits';
  const onCreditsClick = () => onCredits();
  credits.addEventListener('click', onCreditsClick);
  root.append(title, play, settings, credits);
  root.hidden = false;
  app.dataset.screen = 'menu';
  (initialFocus === 'credits' ? credits : play).focus();
  return {
    destroy() {
      settingsScreen?.close();
      settingsScreen = undefined;
      root.inert = false;
      play.removeEventListener('click', onClick);
      credits.removeEventListener('click', onCreditsClick);
      settings.removeEventListener('click', onSettings);
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
