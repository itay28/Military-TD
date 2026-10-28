import Phaser from 'phaser';
import atlasJsonUrl from '../../assets/atlas/sprites.json?url';
import atlasPngUrl from '../../assets/atlas/sprites.png';
import { ATLAS_KEY } from '../data/sprites';
import { firstScene, type TestFlags } from '../testing/flags';

/**
 * First scene. Preloads the sprite atlas, then goes to the Main menu, or the Game in test mode. A failed load doesn't
 * stop the game: the Game scene draws shapes for any sprite it can't find.
 */
export class BootScene extends Phaser.Scene {
  private readonly flags: TestFlags;

  constructor(flags: TestFlags) {
    super('Boot');
    this.flags = flags;
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, atlasPngUrl, atlasJsonUrl);
  }

  create(): void {
    this.scene.start(firstScene(this.flags));
  }
}
