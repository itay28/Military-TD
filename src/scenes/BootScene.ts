import Phaser from 'phaser';
import atlasJsonUrl from '../../assets/atlas/sprites.json?url';
import atlasPngUrl from '../../assets/atlas/sprites.png';
import gameMp3Url from '../../assets/yd-war-on-water/game.mp3';
import gameOggUrl from '../../assets/yd-war-on-water/game.ogg';
import menuMp3Url from '../../assets/yd-war-on-water/menu.mp3';
import menuOggUrl from '../../assets/yd-war-on-water/menu.ogg';
import { musicKey } from '../audio/phaserMusic';
import { groundTextureKey, MAPS } from '../data/maps';
import { RENDERS } from '../data/renders';
import { ATLAS_KEY } from '../data/sprites';
import { firstScene, type TestFlags } from '../testing/flags';

/**
 * First scene. Preloads the sprite atlas, the rendered sprites and each map's ground image, then goes to the Main menu, or
 * the Game in test mode. A failed load doesn't stop the game: the Game scene draws the tileset for a missing ground image,
 * and shapes for any sprite it can't find. Music (#66) loads too, except in test mode, which is silent; a track that
 * fails to load stays silent.
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
    if (!this.flags.test) {
      // OGG first; Phaser falls back to the MP3 on a browser without OGG Vorbis (older Safari).
      this.load.audio(musicKey('menu'), [menuOggUrl, menuMp3Url]);
      this.load.audio(musicKey('game'), [gameOggUrl, gameMp3Url]);
    }
  }

  create(): void {
    this.scene.start(firstScene(this.flags));
  }
}
