import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './data/display';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { createTestApi } from './testing/api';
import { parseTestFlags } from './testing/flags';
import { SCENARIOS } from './testing/scenarios';
import { showVersion } from './ui/version';

const versionEl = document.getElementById('version');
if (versionEl) showVersion(versionEl);

const hudRoot = document.getElementById('hud');
// Unlike the version label, the game can't be played without its HUD.
if (!hudRoot) throw new Error('index.html has no #hud element');
// Same width as the canvas, so the bar lines up with the map above it.
hudRoot.style.width = `${CANVAS_WIDTH}px`;
const buildBarRoot = document.getElementById('build-bar');
if (!buildBarRoot) throw new Error('index.html has no #build-bar element');
const endScreenRoot = document.getElementById('end-screen');
if (!endScreenRoot) throw new Error('index.html has no #end-screen element');

const flags = parseTestFlags(window.location.search);
const gameScene = new GameScene({
  hudRoot,
  buildBarRoot,
  endScreenRoot,
  flags,
  // Installed once the first game exists, so a test that waits for __TD__ can use it at once.
  onCreate: () => {
    if (flags.test) window.__TD__ ??= createTestApi(gameScene.testHooks(), SCENARIOS);
  },
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#2f3a24',
  scene: [BootScene, gameScene],
});
