import Phaser from 'phaser';
import { MAPS } from '../data/maps';
import { mountLevelSelect } from '../ui/levelSelect';

export interface LevelSelectSceneOptions {
  /** The page's `#app`, whose game UI the Level select hides. */
  readonly app: HTMLElement;
  /** Where the Level select's DOM goes. */
  readonly root: HTMLElement;
}

/** The Level select: picking a map starts the Game scene on it; Back returns to the Main menu. DOM: src/ui/levelSelect.ts. */
export class LevelSelectScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly root: HTMLElement;

  constructor({ app, root }: LevelSelectSceneOptions) {
    super('LevelSelect');
    this.app = app;
    this.root = root;
  }

  create(): void {
    const screen = mountLevelSelect(this.root, {
      app: this.app,
      maps: MAPS,
      onPick: (mapId) => this.scene.start('Game', { mapId }),
      onBack: () => this.scene.start('Menu'),
    });
    // Starting another scene shuts this one down, which takes the screen away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
