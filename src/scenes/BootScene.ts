import Phaser from 'phaser';

/** First scene. Nothing to load yet (shapes only), so it goes straight to the Game scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Game');
  }
}
