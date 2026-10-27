import Phaser from 'phaser';
import { mountMainMenu } from '../ui/mainMenu';
import type { OpenSettings } from '../ui/settingsScreen';

export interface MenuSceneOptions {
  /** The page's `#app`, whose game UI the menu hides. */
  readonly app: HTMLElement;
  /** Where the menu's DOM goes. */
  readonly menuRoot: HTMLElement;
  /** Opens the Settings screen over the menu. */
  readonly openSettings: OpenSettings;
}

/** The Main menu: a title, Play (opens the Level select) and Settings. The menu itself is DOM (src/ui/mainMenu.ts). */
export class MenuScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly menuRoot: HTMLElement;
  private readonly openSettings: OpenSettings;

  constructor({ app, menuRoot, openSettings }: MenuSceneOptions) {
    super('Menu');
    this.app = app;
    this.menuRoot = menuRoot;
    this.openSettings = openSettings;
  }

  create(): void {
    const menu = mountMainMenu(this.menuRoot, {
      app: this.app,
      onPlay: () => this.scene.start('LevelSelect'),
      openSettings: this.openSettings,
    });
    // Starting the Level select shuts this one down, which takes the menu away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => menu.destroy());
  }
}
