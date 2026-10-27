export interface MainMenuOptions {
  /** The page's `#app`: marked `data-screen="menu"` while the menu shows, which hides the HUD, build bar and tower panel. */
  readonly app: HTMLElement;
  /** Called when the player presses Play. */
  readonly onPlay: () => void;
}

export interface MainMenu {
  /** Removes the menu's elements, hides it and shows the game's UI again; Play does nothing after this. */
  destroy(): void;
}

/** Builds the Main menu inside `root`, a screen over the whole page. It's DOM, so tests can query it (ADR-0003). */
export function mountMainMenu(root: HTMLElement, { app, onPlay }: MainMenuOptions): MainMenu {
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
  root.append(title, play, settings);
  root.hidden = false;
  app.dataset.screen = 'menu';
  play.focus();
  return {
    destroy() {
      play.removeEventListener('click', onClick);
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
