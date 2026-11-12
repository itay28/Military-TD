import Phaser from 'phaser';
import { MAPS } from '../data/maps';
import type { ProgressStore } from '../progress/progress';
import type { SettingsStore } from '../settings/settings';
import { isHardUnlocked, isUnlocked } from '../sim/progression';
import { mountLevelSelect } from '../ui/levelSelect';
import { showDemo } from './demoMode';

export interface LevelSelectSceneOptions {
  /** The page's `#app`, whose game UI the Level select hides. */
  readonly app: HTMLElement;
  /** Where the Level select's DOM goes. */
  readonly root: HTMLElement;
  /** Saved progress, which decides the maps unlocked. */
  readonly progress: ProgressStore;
  /** Test mode's `?unlock=all`: every map, and Hard on each, can be picked. */
  readonly unlockAll: boolean;
  /** Show the Hard buttons: `HARD_IN_PLAY`, or test mode. */
  readonly showHard: boolean;
  /** The player's settings: Tactical mode decides the "max 2 stars" note. */
  readonly settings: Pick<SettingsStore, 'get'>;
}

/** The Level select: picking an unlocked map starts the Game scene on it; Back returns to the Main menu. DOM: src/ui/levelSelect.ts. */
export class LevelSelectScene extends Phaser.Scene {
  private readonly app: HTMLElement;
  private readonly root: HTMLElement;
  private readonly progress: ProgressStore;
  private readonly unlockAll: boolean;
  private readonly showHard: boolean;

  private readonly settings: Pick<SettingsStore, 'get'>;

  constructor({ app, root, progress, unlockAll, showHard, settings }: LevelSelectSceneOptions) {
    super('LevelSelect');
    this.app = app;
    this.root = root;
    this.progress = progress;
    this.unlockAll = unlockAll;
    this.showHard = showHard;
    this.settings = settings;
  }

  /** Runs each time the scene starts, so it reads the progress as it is now, after any game since. */
  create(): void {
    // The live battlefield plays behind the menu screens (#402); a running one carries on.
    showDemo(this.scene);
    const mapIds = MAPS.map((map) => map.id);
    const progress = this.progress.get();
    const screen = mountLevelSelect(this.root, {
      app: this.app,
      maps: MAPS,
      statusOf: (index) => {
        const mapId = mapIds[index]!;
        return {
          unlocked: this.unlockAll || isUnlocked(index, mapIds, progress),
          bestStars: progress.maps[mapId]?.bestStars ?? 0,
          hardUnlocked: this.unlockAll || isHardUnlocked(mapId, progress),
          hardStars: progress.maps[mapId]?.hardStars ?? 0,
        };
      },
      onPick: (mapId, difficulty) => this.scene.start('Game', { mapId, difficulty }),
      onBack: () => this.scene.start('Menu'),
      tacticalMode: this.settings.get().tacticalMode,
      showHard: this.showHard,
    });
    // Starting another scene shuts this one down, which takes the screen away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
