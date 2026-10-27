import Phaser from 'phaser';
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
const buildBarRoot = document.getElementById('build-bar');
if (!buildBarRoot) throw new Error('index.html has no #build-bar element');
const endScreenRoot = document.getElementById('end-screen');
if (!endScreenRoot) throw new Error('index.html has no #end-screen element');
const towerPanelRoot = document.getElementById('tower-panel');
if (!towerPanelRoot) throw new Error('index.html has no #tower-panel element');
const pauseMenuRoot = document.getElementById('pause-menu');
if (!pauseMenuRoot) throw new Error('index.html has no #pause-menu element');

const flags = parseTestFlags(window.location.search);
const gameScene = new GameScene({
  hudRoot,
  buildBarRoot,
  endScreenRoot,
  towerPanelRoot,
  pauseMenuRoot,
  flags,
  // Installed once the first game exists, so a test that waits for __TD__ can use it at once.
  onCreate: () => {
    if (flags.test) window.__TD__ ??= createTestApi(gameScene.testHooks(), SCENARIOS);
  },
});

const gameRoot = document.getElementById('game');
if (!gameRoot) throw new Error('index.html has no #game element');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameRoot,
  // The canvas fills the space left by the HUD and the build bar, at any window size; the camera fits the map in it.
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  // The mouse and two fingers, for a pinch.
  input: { activePointers: 2 },
  backgroundColor: '#1b1e16',
  scene: [BootScene, gameScene],
});
// Phaser resizes on window resizes only; collapsing the build bar or the HUD wrapping resizes the stage without one.
new ResizeObserver(() => {
  if (game.scale.getParentBounds()) game.scale.refresh();
}).observe(gameRoot);
