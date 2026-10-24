import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './data/display';
import { BootScene } from './scenes/BootScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#2f3a24',
  scene: [BootScene],
});
