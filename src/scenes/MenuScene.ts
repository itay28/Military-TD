import Phaser from 'phaser';
import { mountCredits, type Credits } from '../ui/credits';
import { mountMainMenu, type MainMenu } from '../ui/mainMenu';
import type { OpenHowToPlay } from '../ui/howToPlay';
import type { OpenSettings } from '../ui/settingsScreen';

export interface MenuSceneOptions {
  /** The page's `#app`, whose game UI the menu hides. */
  readonly app: HTMLElement;
  /** Where the menu's DOM goes. */
  readonly menuRoot: HTMLElement;
  /** Opens the Settings screen over the menu. */
  readonly openSettings: OpenSettings;
  /** Opens the How to play screen over the menu. */
  readonly openHowToPlay: OpenHowToPlay;
}

/** The Main menu: a title, Play (opens the Level select), Settings, How to play and Credits (a second screen in the same root, with Back). Both are DOM (src/ui/). */
export class MenuScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly menuRoot: HTMLElement;
  private readonly openSettings: OpenSettings;
  private readonly openHowToPlay: OpenHowToPlay;

  constructor({ app, menuRoot, openSettings, openHowToPlay }: MenuSceneOptions) {
    super('Menu');
    this.app = app;
    this.menuRoot = menuRoot;
    this.openSettings = openSettings;
    this.openHowToPlay = openHowToPlay;
  }

  create(): void {
    let screen: MainMenu | Credits | undefined;
    const showMenu = (initialFocus: 'play' | 'credits') => {
      screen?.destroy();
      screen = mountMainMenu(this.menuRoot, {
        app: this.app,
        onPlay: () => this.scene.start('LevelSelect'),
        onCredits: showCredits,
        openSettings: this.openSettings,
        openHowToPlay: this.openHowToPlay,
        initialFocus,
      });
    };
    const showCredits = () => {
      screen?.destroy();
      screen = mountCredits(this.menuRoot, { app: this.app, onBack: () => showMenu('credits') });
    };
    showMenu('play');
    // Starting the Level select shuts this one down, which takes the screen away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen?.destroy());
  }
}
