import Phaser from 'phaser';
import { firstScene, type TestFlags } from '../testing/flags';

/** First scene. Nothing to load yet (shapes only), so it goes straight to the Main menu, or the Game in test mode. */
export class BootScene extends Phaser.Scene {
  private readonly flags: TestFlags;

  constructor(flags: TestFlags) {
    super('Boot');
    this.flags = flags;
  }

  create(): void {
    this.scene.start(firstScene(this.flags));
  }
}
