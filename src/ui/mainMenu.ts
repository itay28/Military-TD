export interface MainMenuOptions {
  /** The page's `#app`: marked `data-screen="menu"` while the menu shows, which hides the HUD, build bar and tower panel. */
  readonly app: HTMLElement;
  /** Called when the player presses Play. */
  readonly onPlay: () => void;
  /** Called when the player presses Credits. */
  readonly onCredits: () => void;
  /** The button to focus: Play when the menu opens, Credits when coming back from the Credits screen. */
  readonly initialFocus?: 'play' | 'credits';
}

export interface MainMenu {
  /** Removes the menu's elements, hides it and shows the game's UI again; Play does nothing after this. */
  destroy(): void;
}

/** Builds the Main menu inside `root`, a screen over the whole page. It's DOM, so tests can query it (ADR-0003). */
export function mountMainMenu(
  root: HTMLElement,
  { app, onPlay, onCredits, initialFocus = 'play' }: MainMenuOptions,
): MainMenu {
  const doc = root.ownerDocument;
  const title = doc.createElement('h1');
  title.textContent = 'Military TD';
  const play = doc.createElement('button');
  play.type = 'button';
  play.textContent = 'Play';
  const onClick = () => onPlay();
  play.addEventListener('click', onClick);
  // The Settings screen is #48; until it lands the button shows what's coming but does nothing.
  const settings = doc.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Settings';
  settings.disabled = true;
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
      play.removeEventListener('click', onClick);
      credits.removeEventListener('click', onCreditsClick);
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
