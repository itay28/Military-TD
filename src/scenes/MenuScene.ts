import Phaser from 'phaser';
import { mountCredits, type Credits } from '../ui/credits';
import { mountMainMenu, type MainMenu } from '../ui/mainMenu';

export interface MenuSceneOptions {
  /** The page's `#app`, whose game UI the menu hides. */
  readonly app: HTMLElement;
  /** Where the menu's DOM goes. */
  readonly menuRoot: HTMLElement;
}

/** The Main menu: a title, Play (starts the Game scene), Settings and Credits (a second screen in the same root, with Back). Both are DOM (src/ui/). */
export class MenuScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly menuRoot: HTMLElement;

  constructor({ app, menuRoot }: MenuSceneOptions) {
    super('Menu');
    this.app = app;
    this.menuRoot = menuRoot;
  }

  create(): void {
    let screen: MainMenu | Credits | undefined;
    const showMenu = (initialFocus: 'play' | 'credits') => {
      screen?.destroy();
      screen = mountMainMenu(this.menuRoot, {
        app: this.app,
        onPlay: () => this.scene.start('Game'),
        onCredits: showCredits,
        initialFocus,
      });
    };
    const showCredits = () => {
      screen?.destroy();
      screen = mountCredits(this.menuRoot, { app: this.app, onBack: () => showMenu('credits') });
    };
    showMenu('play');
    // Starting the Game scene shuts this one down, which takes the screen away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen?.destroy());
  }
}
