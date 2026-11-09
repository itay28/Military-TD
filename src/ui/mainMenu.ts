import { TERMS } from '../data/display';
import type { OpenFieldManual } from './fieldManual';
import type { OpenHowToPlay } from './howToPlay';
import type { OpenSettings } from './settingsScreen';
import { GAME_TITLE } from './gameTitle';

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
  /** Opens the Field manual over the menu (#408). Without it, Field manual is disabled. */
  readonly openFieldManual?: OpenFieldManual | undefined;
  /** Opens the How to play screen over the menu. Without it, How to play is disabled. */
  readonly openHowToPlay?: OpenHowToPlay;
}

export interface MainMenu {
  /** Closes an open Settings screen or Field manual, removes the menu's elements, hides it and shows the game's UI again; Play does nothing after this. */
  destroy(): void;
}

/** Builds the Main menu inside `root`, a screen over the whole page. It's DOM, so tests can query it (ADR-0003). */
export function mountMainMenu(
  root: HTMLElement,
  { app, onPlay, onCredits, openSettings, openFieldManual, openHowToPlay, initialFocus = 'play' }: MainMenuOptions,
): MainMenu {
  const doc = root.ownerDocument;
  const title = doc.createElement('h1');
  title.textContent = GAME_TITLE;
  const play = doc.createElement('button');
  play.type = 'button';
  play.textContent = TERMS.play;
  const onClick = () => onPlay();
  play.addEventListener('click', onClick);
  // Open, Settings, the Field manual or How to play covers the menu, which goes inert behind it until Back.
  let subScreen: { close(): void } | undefined;
  const subScreenButton = (text: string, open: ((onBack: () => void) => { close(): void }) | undefined) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = text;
    if (open)
      button.addEventListener('click', () => {
        root.inert = true;
        subScreen = open(() => {
          subScreen = undefined;
          root.inert = false;
          button.focus();
        });
      });
    else button.disabled = true;
    return button;
  };
  const settings = subScreenButton('Settings', openSettings);
  const fieldManual = subScreenButton('Field manual', openFieldManual);
  const howTo = subScreenButton('How to play', openHowToPlay);
  const credits = doc.createElement('button');
  credits.type = 'button';
  credits.textContent = 'Credits';
  const onCreditsClick = () => onCredits();
  credits.addEventListener('click', onCreditsClick);
  root.append(title, play, settings, fieldManual, howTo, credits);
  root.hidden = false;
  app.dataset.screen = 'menu';
  (initialFocus === 'credits' ? credits : play).focus();
  return {
    destroy() {
      subScreen?.close();
      subScreen = undefined;
      root.inert = false;
      play.removeEventListener('click', onClick);
      credits.removeEventListener('click', onCreditsClick);
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
