import Phaser from 'phaser';
import { MAPS } from '../data/maps';
import type { ProgressStore } from '../progress/progress';
import { isUnlocked } from '../sim/progression';
import { mountLevelSelect } from '../ui/levelSelect';

export interface LevelSelectSceneOptions {
  /** The page's `#app`, whose game UI the Level select hides. */
  readonly app: HTMLElement;
  /** Where the Level select's DOM goes. */
  readonly root: HTMLElement;
  /** Saved progress, which decides the maps unlocked. */
  readonly progress: ProgressStore;
  /** Test mode's `?unlock=all`: every map can be picked. */
  readonly unlockAll: boolean;
}

/** The Level select: picking an unlocked map starts the Game scene on it; Back returns to the Main menu. DOM: src/ui/levelSelect.ts. */
export class LevelSelectScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly root: HTMLElement;
  private readonly progress: ProgressStore;
  private readonly unlockAll: boolean;

  constructor({ app, root, progress, unlockAll }: LevelSelectSceneOptions) {
    super('LevelSelect');
    this.app = app;
    this.root = root;
    this.progress = progress;
    this.unlockAll = unlockAll;
  }

  /** Runs each time the scene starts, so it reads the progress as it is now, after any game since. */
  create(): void {
    const mapIds = MAPS.map((map) => map.id);
    const progress = this.progress.get();
    const screen = mountLevelSelect(this.root, {
      app: this.app,
      maps: MAPS,
      statusOf: (index) => ({
        unlocked: this.unlockAll || isUnlocked(index, mapIds, progress),
        bestStars: progress.maps[mapIds[index]!]?.bestStars ?? 0,
      }),
      onPick: (mapId) => this.scene.start('Game', { mapId }),
      onBack: () => this.scene.start('Menu'),
    });
    // Starting another scene shuts this one down, which takes the screen away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
