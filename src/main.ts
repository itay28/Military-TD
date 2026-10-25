import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './data/display';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { showVersion } from './ui/version';

const versionEl = document.getElementById('version');
if (versionEl) showVersion(versionEl);

const hudRoot = document.getElementById('hud');
// Unlike the version label, the game can't be played without its HUD.
if (!hudRoot) throw new Error('index.html has no #hud element');
// Same width as the canvas, so the bar lines up with the map above it.
hudRoot.style.width = `${CANVAS_WIDTH}px`;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#2f3a24',
  scene: [BootScene, new GameScene({ hudRoot })],
});
