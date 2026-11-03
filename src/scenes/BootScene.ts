import Phaser from 'phaser';
import atlasJsonUrl from '../../assets/atlas/sprites.json?url';
import atlasPngUrl from '../../assets/atlas/sprites.png';
import { groundTextureKey, MAPS } from '../data/maps';
import { RENDERS } from '../data/renders';
import { SOUND_URLS } from '../data/sounds';
import { soundKey } from '../audio/phaserAudio';
import { SOUND_IDS } from '../audio/sounds';
import { ATLAS_KEY } from '../data/sprites';
import { firstScene, type TestFlags } from '../testing/flags';

/**
 * First scene. Preloads the sprite atlas, the rendered sprites, each map's ground image and the sounds, then goes to the
 * Main menu, or the Game in test mode. A failed load doesn't stop the game: the Game scene draws the tileset for a missing
 * ground image, shapes for any sprite it can't find, and stays silent for a sound that didn't load.
 */
export class BootScene extends Phaser.Scene {
  private readonly flags: TestFlags;

  constructor(flags: TestFlags) {
    super('Boot');
    this.flags = flags;
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, atlasPngUrl, atlasJsonUrl);
    for (const { id, groundImageUrl } of MAPS) {
      if (groundImageUrl !== undefined) this.load.image(groundTextureKey(id), groundImageUrl);
    }
    // Each render's hull and turret, at full size (ADR-0009); a kind whose render fails keeps its Kenney frame.
    for (const render of Object.values(RENDERS)) {
      this.load.image(render.hullKey, render.hullUrl);
      this.load.image(render.turretKey, render.turretUrl);
    }
    // Test mode is silent (#45), so it skips the sound files too.
    if (!this.flags.test) {
      for (const id of SOUND_IDS) this.load.audio(soundKey(id), SOUND_URLS[id]);
    }
  }

  create(): void {
    this.scene.start(firstScene(this.flags));
  }
}
