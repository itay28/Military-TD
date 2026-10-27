import Phaser from 'phaser';
import { mountMainMenu } from '../ui/mainMenu';

export interface MenuSceneOptions {
  /** The page's `#app`, whose game UI the menu hides. */
  readonly app: HTMLElement;
  /** Where the menu's DOM goes. */
  readonly menuRoot: HTMLElement;
}

/** The Main menu: a title, Play (starts the Game scene) and Settings. The menu itself is DOM (src/ui/mainMenu.ts). */
export class MenuScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly menuRoot: HTMLElement;

  constructor({ app, menuRoot }: MenuSceneOptions) {
    super('Menu');
    this.app = app;
    this.menuRoot = menuRoot;
  }

  create(): void {
    const menu = mountMainMenu(this.menuRoot, { app: this.app, onPlay: () => this.scene.start('Game') });
    // Starting the Game scene shuts this one down, which takes the menu away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => menu.destroy());
  }
}
