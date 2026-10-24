import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../data/display';

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
  }
}
