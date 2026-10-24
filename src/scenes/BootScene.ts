import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../data/display';
import { GAME_VERSION, versionLabel } from '../data/version';

/** First scene. For now it only shows a placeholder title; real menus are a DOM overlay (ADR-0003). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 'MILITARY TD', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#d8d3b0',
      })
      .setOrigin(0.5);

    // Small, bottom-right, so bug reports can name the build (ADR-0004).
    this.add
      .text(CANVAS_WIDTH - 6, CANVAS_HEIGHT - 4, versionLabel(GAME_VERSION), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a8670',
      })
      .setOrigin(1, 1);
  }
}
