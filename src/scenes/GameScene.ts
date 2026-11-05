import Phaser from 'phaser';
import atlasPngUrl from '../../assets/atlas/sprites.png';
import {
  CAMERA,
  DISMANTLE,
  EFFECT,
  ENEMY_HIT_PX,
  ENEMY_NAMES,
  FLOATING_TEXT,
  SHELL,
  SPRITE_SCALE,
  TILE_PX,
  TRACER,
} from '../data/display';
import { soundFor, type SoundEvent } from '../audio/sounds';
import { silentAudio, throttleAudio } from '../audio/audioOut';
import { distanceVolume, viewCenter } from '../audio/distance';
import { createPhaserAudio } from '../audio/phaserAudio';
import { gameMusic, type MusicController } from '../audio/music';
import { duckForRadio, MUSIC_REGISTRY_KEY } from '../audio/radio';
import type { AudioMix } from '../audio/volume';
import { createWhistleTracker } from '../audio/whistle';
import { RADIO_CUE_MS, SOUND_FALLOFF, SOUND_THROTTLE, SOUND_THROTTLE_BY_ID, WHISTLE_LEAD_MS } from '../data/sounds';
import { RENDER_FACING, renderFor, type RenderedSprite } from '../data/renders';
import { ATLAS_KEY, SPRITE_HEADING, TOWER_BASES, TURRET_FACING, spriteFor, type SpriteKind } from '../data/sprites';
import type { EnemyKind } from '../data/enemies';
import { DISMANTLE_MS, type TowerKind } from '../data/towers';
import { groundTextureKey, MAPS, mapById } from '../data/maps';
import type { Faction } from '../sim/factions';
import type { Enemy } from '../sim/enemies';
import { TICK_MS, type Game } from '../sim/game';
import { tileCenter, type Position, type Tile } from '../sim/map';
import { starsFor, unlocksNext } from '../sim/progression';
import { setUpGame, type GameSetup } from '../sim/scenario';
import type { ProgressStore, WinStars } from '../progress/progress';
import type { SettingsStore } from '../settings/settings';
import { towerAt, type Tower } from '../sim/towers';
import type { TestHooks, TestView } from '../testing/api';
import { frameMs, type TestFlags } from '../testing/flags';
import {
  canPlaceAt,
  clampView,
  fitView,
  panBy,
  screenToWorld,
  zoomAt,
  type CameraBounds,
  type CameraView,
} from './camera';
import { pixelToTile, toPixels, type Pixel } from './coords';
import {
  drawBlasts,
  drawDismantleRing,
  drawEnemy,
  drawGhost,
  drawHpBar,
  drawLevelPips,
  drawRangeRing,
  drawSelection,
  drawShells,
  drawTower,
  drawEffects,
  drawTracers,
} from './drawEntities';
import { drawGrid, drawMap } from './drawMap';
import { animFrame, bobScale, rotorAngle } from './enemyAnim';
import { createFixedStep, type FixedStep } from './fixedStep';
import { MAX_GAME_SPEED, type GameSpeed, type GameSpeedControl } from './gameSpeed';
import { createGestures, hoverFrom, type Gesture, type Gestures } from './gestures';
import { createEffects, type Effects } from './effects';
import { createFloatingTexts, type FloatingTexts, type FloatingTextView } from './floatingTexts';
import { headingOf, spriteRotation } from './heading';
import { muzzlePoints, renderPlacement } from './renderPlacement';
import { interpolatePosition, snapshotPositions } from './interpolate';
import { ghostAt, placeAt, type Ghost } from './placement';
import { enemyAt, resolveClick } from './selection';
import { createBlasts, shellPoint, type Blasts } from './shellView';
import { createTracers, type Tracers } from './tracers';
import { TILESET_FRAMES, tileArt } from './tileset';
import { buildOptions, mountBuildBar, type BuildBar, type IconAtlas } from '../ui/buildBar';
import { mountEndScreen, type EndScreen, type VictoryResult } from '../ui/endScreen';
import { mountHud, type Hud } from '../ui/hud';
import { mountPauseMenu, type PauseMenu } from '../ui/pauseMenu';
import type { OpenSettings } from '../ui/settingsScreen';
import { mountTowerPanel, type TowerPanel } from '../ui/towerPanel';
import { mountEnemyCard, type EnemyCard } from '../ui/enemyCard';
import { createViewSync, type ViewSync } from './viewSync';

/** Real time keeps up down to about 12 fps; below that the game runs slower instead of spiralling. */
const MAX_TICKS_PER_FRAME = 5;

const towerCenter = (tower: Tower): Pixel => toPixels(tileCenter(tower.tile));
/** What a drawn range ring depends on: the tower, and its range, which an upgrade can change. */
const ringKey = (tower: Tower): string => `${tower.id}@${tower.range}`;
const ringKeyTowerId = (key: string): number => Number(key.split('@')[0]);

/** Draw order, back to front. */
const DEPTH = {
  map: 0,
  towers: 1,
  enemies: 2,
  air: 3,
  tracers: 4,
  shells: 4,
  effects: 4,
  ghost: 5,
  rangeRing: 6,
  floatingText: 7,
} as const;

/** Puts `object` on `layer`: the depth that orders it, and the name test mode's view() reports it by. */
function onLayer<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(
  object: T,
  layer: keyof typeof DEPTH,
): T {
  return object.setDepth(DEPTH[layer]).setName(layer);
}

/**
 * An enemy or tower: its sprite, if it has one, and a Graphics over it with its shape or just its overlays. An enemy
 * drawn from a render (ADR-0009) has a Container of hull and turret for its sprite; a tower's is its turret.
 */
interface EntityView {
  readonly sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container | undefined;
  readonly graphics: Phaser.GameObjects.Graphics;
  /** Whether the sprite is a render rather than a Kenney frame. */
  readonly rendered: boolean;
  /** The sprite's scale before any bob, and the way it faces as drawn (radians, 0 east). */
  readonly spriteScale: number;
  readonly facing: number;
}

interface EnemyView extends EntityView {
  readonly id: number;
  readonly kind: EnemyKind;
  /** The HP and movement frame last drawn, so the shape or HP bar is redrawn only when one changes. */
  hp: number;
  frame: number;
  /** The way it is heading (`headingOf`), kept while it stands still. */
  heading: number;
}

/** A tower: its base sprite (a render's hull), its turret (the entity sprite) and the angle the turret has turned to. */
interface TowerView extends EntityView {
  readonly towerId: number;
  readonly kind: TowerKind;
  readonly base: Phaser.GameObjects.Image | undefined;
  /** The level last drawn, so the pips are redrawn only when an upgrade changes it. */
  level: number;
  readonly ring: Phaser.GameObjects.Graphics;
  /** Radians, 0 east: the sim's `Tower.heading`, as last drawn. */
  angle: number;
}

export interface GameSceneOptions {
  /** The DOM element the HUD is drawn in (`#hud` in index.html). */
  readonly hudRoot: HTMLElement;
  /** The DOM element right of the canvas the build bar is drawn in (`#build-bar` in index.html). */
  readonly buildBarRoot: HTMLElement;
  /** The DOM element over the canvas the End screen is drawn in (`#end-screen` in index.html). */
  readonly endScreenRoot: HTMLElement;
  /** The DOM element over the canvas the tower panel is drawn in (`#tower-panel` in index.html). */
  readonly towerPanelRoot: HTMLElement;
  /** The DOM element over the canvas the enemy card is drawn in (`#enemy-card` in index.html). */
  readonly enemyCardRoot: HTMLElement;
  /** The DOM element over the canvas the pause menu is drawn in (`#pause-menu` in index.html). */
  readonly pauseMenuRoot: HTMLElement;
  /** Test mode's URL flags (ADR-0003). */
  readonly flags: TestFlags;
  /** The player's settings, read live: each game starts at the default speed, and range rings follow every frame. */
  readonly settings: SettingsStore;
  /** The audio mix (#67): sound effects play at its SFX volume, silent while the tab is hidden. */
  readonly audioMix: AudioMix;
  /** Opens the Settings screen, from the pause menu. */
  readonly openSettings: OpenSettings;
  /** Saved progress: each Victory records its Stars here. */
  readonly progress: ProgressStore;
  /** Called at the end of every create(), the first game's and each restart's. */
  readonly onCreate?: () => void;
}

/** Owns the Simulation, draws it, and advances it on a fixed timestep. */
export class GameScene extends Phaser.Scene {
  private readonly hudRoot: HTMLElement;
  private readonly buildBarRoot: HTMLElement;
  private readonly endScreenRoot: HTMLElement;
  private readonly towerPanelRoot: HTMLElement;
  private readonly enemyCardRoot: HTMLElement;
  private readonly pauseMenuRoot: HTMLElement;
  private readonly flags: TestFlags;
  private readonly settings: SettingsStore;
  private readonly audioMix: AudioMix;
  private readonly openSettings: OpenSettings;
  private readonly progress: ProgressStore;
  private readonly onCreate: (() => void) | undefined;
  /** How each game starts, the first and every restart. Test mode's loadScenario changes it. */
  private setup: GameSetup = {};
  /** The map picked on the Level select, kept across restarts. A loaded scenario's own map overrides it. */
  private mapId: string = MAPS[0]!.id;
  private sim!: Game;
  /** Starts the incoming whistle of each shell about to land; set up by `wireSounds`. */
  private playWhistles: () => void = () => {};
  private loop!: FixedStep;
  /** How the map was drawn, for the test view. */
  private mapTiles: TestView['mapTiles'] = 'shapes';
  /** The player's game speed. Each game starts at the default speed in the settings. */
  private gameSpeed: GameSpeed = 1;
  private hud!: Hud;
  private buildBar!: BuildBar;
  private endScreen!: EndScreen;
  /** What this game's Victory earned, once it is won. */
  private result: VictoryResult | undefined;
  private towerPanel!: TowerPanel;
  private enemyCard!: EnemyCard;
  private pauseMenu!: PauseMenu;
  private enemyViews!: ViewSync<Enemy, EnemyView>;
  private towerViews!: ViewSync<Tower>;
  /** Each tower's view by id, for `view()`'s turret angles. */
  private readonly towerViewById = new Map<number, TowerView>();
  private effects!: Effects;
  private effectGraphics!: Phaser.GameObjects.Graphics;
  private tracers!: Tracers;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private blasts!: Blasts;
  private shellGraphics!: Phaser.GameObjects.Graphics;
  private rangeRing!: Phaser.GameObjects.Graphics;
  private selectedRing!: Phaser.GameObjects.Graphics;
  /** With Always show tower ranges: every tower's range ring but the selected one's, which `selectedRing` draws. */
  private allRings!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  /** The ghost last drawn, and its kind, so it is redrawn only when its tile, colour or kind changes. */
  private ghost: (Ghost & { readonly kind: TowerKind }) | undefined;
  private floatingTexts!: FloatingTexts;
  private floatingTextViews!: ViewSync<FloatingTextView>;
  /** Enemy positions before the latest tick, to interpolate from. */
  private previousPositions!: ReadonlyMap<number, Position>;
  /** Real time the enemies' movement animation has run, in ms: it stops while paused and never runs with ?anim=0. */
  private animMs = 0;
  /** The tile under the pointer, or undefined when it is off the canvas. */
  private pointerTile: Tile | undefined;
  /** The world pixel under a hovering mouse, for the enemy card; undefined for a finger or off the canvas. */
  private pointerPoint: Pixel | undefined;
  /** The tower under the pointer whose range ring is drawn, as its `ringKey`. */
  private hoveredRingKey: string | undefined;
  /** The selected tower whose range ring is drawn, as its `ringKey`. */
  private selectedRingKey: string | undefined;
  /** The towers `allRings` draws now, by id, and their `ringKey`s joined, so the rings are redrawn only on a change. */
  private allRingIds: readonly number[] = [];
  private allRingsKey = '';
  /** Where the camera looks. */
  private view!: CameraView;
  /** Whether the player has not panned or zoomed yet, so a resize fits the whole map again. */
  private fitted = true;
  private gestures!: Gestures;

  constructor({
    hudRoot,
    buildBarRoot,
    endScreenRoot,
    towerPanelRoot,
    enemyCardRoot,
    pauseMenuRoot,
    flags,
    settings,
    audioMix,
    openSettings,
    progress,
    onCreate,
  }: GameSceneOptions) {
    super('Game');
    this.hudRoot = hudRoot;
    this.buildBarRoot = buildBarRoot;
    this.endScreenRoot = endScreenRoot;
    this.towerPanelRoot = towerPanelRoot;
    this.enemyCardRoot = enemyCardRoot;
    this.pauseMenuRoot = pauseMenuRoot;
    this.flags = flags;
    this.settings = settings;
    this.audioMix = audioMix;
    this.openSettings = openSettings;
    this.progress = progress;
    this.onCreate = onCreate;
  }

  /** What test mode drives this scene through (`window.__TD__`). */
  testHooks(): TestHooks {
    const current = () => this.sim;
    return {
      // A getter, not a copy: every restart (Restart, loadScenario) replaces this.sim.
      get game() {
        return current();
      },
      step: (ticks) => {
        for (let i = 0; i < ticks; i++) this.tickOnce();
      },
      load: (setup) => {
        setUpGame(setup); // throws for a bad setup before the running game is torn down
        this.setup = setup;
        return new Promise((resolve) => {
          this.events.once(Phaser.Scenes.Events.CREATE, () => resolve());
          this.scene.restart();
        });
      },
      view: () => this.testView(),
    };
  }

  /** What test mode's view() reports: read from the display objects, so it shows what Phaser renders. */
  private testView(): TestView {
    this.children.depthSort(); // the order the next render draws in
    const camera = this.cameras.main;
    const layers = this.children.list.map((object) => object.name).filter((name) => name !== '');
    return {
      rangeRing: {
        visible: this.rangeRing.visible,
        towerId: this.hoveredRingKey ? ringKeyTowerId(this.hoveredRingKey) : null,
        center: { x: this.rangeRing.x, y: this.rangeRing.y },
      },
      rangeRings: [
        ...this.allRingIds,
        ...[this.selectedRingKey, this.hoveredRingKey].flatMap((key) => (key ? [ringKeyTowerId(key)] : [])),
      ].sort((a, b) => a - b),
      tracers: this.tracers.active(),
      effects: this.effects.active(),
      ghost: { visible: this.ghostGraphics.visible, tile: this.ghost?.tile ?? null },
      camera: { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom },
      drawOrder: layers.filter((name, i) => name !== layers[i - 1]),
      sprites: this.textures.exists(ATLAS_KEY),
      mapTiles: this.mapTiles,
      enemies: this.enemyViews.views().map(({ id, kind, heading, frame }) => ({ id, kind, facing: heading, frame })),
      enemyCard: this.enemyCardView(),
      turrets: [...this.towerViewById].map(([towerId, { angle }]) => ({ towerId, angle })),
      rendered: [
        ...new Set(
          [...this.enemyViews.views(), ...this.towerViewById.values()].flatMap((v) => (v.rendered ? [v.kind] : [])),
        ),
      ].sort(),
    };
  }

  /** The atlas frame `kind` is drawn with, or null to draw its shape: it has none, or the atlas didn't load. */
  private frameFor(kind: SpriteKind): string | null {
    return this.atlasFrame(spriteFor(kind));
  }

  /** The loaded atlas for the build bar's DOM icons, or undefined when it didn't load (the bar keeps its shapes). */
  private iconAtlas(): IconAtlas | undefined {
    if (!this.textures.exists(ATLAS_KEY)) return undefined;
    const texture = this.textures.get(ATLAS_KEY);
    return {
      url: atlasPngUrl, // not the texture's own blob URL: Phaser revokes that once the image has loaded
      frame: (name) => {
        if (!texture.has(name)) return null;
        const { cutX, cutY, cutWidth, cutHeight } = texture.get(name);
        return { x: cutX, y: cutY, w: cutWidth, h: cutHeight };
      },
    };
  }

  /** `frame`, or null when it is null or the atlas lacks it (or didn't load). */
  private atlasFrame(frame: string | null): string | null {
    if (frame === null || !this.textures.exists(ATLAS_KEY)) return null;
    return this.textures.get(ATLAS_KEY).has(frame) ? frame : null;
  }

  /** The render `kind` is drawn with, or null for Kenney: it has none, or its textures didn't load. */
  private renderOf(kind: SpriteKind): RenderedSprite | null {
    const render = renderFor(kind);
    if (render === null || !this.textures.exists(render.hullKey) || !this.textures.exists(render.turretKey))
      return null;
    return render;
  }

  /** A sprite of `kind` and a Graphics over it on `layer`, both at `at`; no sprite when `kind` has no frame. */
  private addEntityView(kind: SpriteKind, layer: keyof typeof DEPTH, { x, y }: Pixel, facing: number): EntityView {
    const frame = this.frameFor(kind);
    // Made first, so the Graphics on the same layer draws over it.
    const sprite = frame === null ? undefined : onLayer(this.add.image(x, y, ATLAS_KEY, frame), layer);
    sprite?.setScale(SPRITE_SCALE);
    const graphics = onLayer(this.add.graphics(), layer).setPosition(x, y);
    return { sprite, graphics, rendered: false, spriteScale: SPRITE_SCALE, facing };
  }

  /** A tower in Kenney's sprites: its base frame, then its turret over it (none for a kind drawn as a shape). */
  private addKenneyTowerView(kind: TowerKind, at: Pixel): EntityView & { base: Phaser.GameObjects.Image | undefined } {
    const baseFrame = this.frameFor(kind) === null ? null : this.atlasFrame(TOWER_BASES[kind]);
    // Made before the turret, so the turret draws over it.
    const base =
      baseFrame === null
        ? undefined
        : onLayer(this.add.image(at.x, at.y, ATLAS_KEY, baseFrame), 'towers').setScale(SPRITE_SCALE);
    return { base, ...this.addEntityView(kind, 'towers', at, TURRET_FACING[kind]) };
  }

  /** An enemy drawn from `render`: hull, then the turret over its shadow, turned together; a Graphics over both. */
  private addRenderedEnemyView(render: RenderedSprite, layer: keyof typeof DEPTH): EntityView {
    const { scale, turretOrigin, turretOffset } = renderPlacement(render);
    const hull = this.add.image(0, 0, render.hullKey).setScale(scale);
    const turret = this.add
      .image(turretOffset.x, turretOffset.y, render.turretKey)
      .setOrigin(turretOrigin.x, turretOrigin.y)
      .setScale(scale);
    const sprite = onLayer(this.add.container(0, 0, [hull, turret]), layer);
    const graphics = onLayer(this.add.graphics(), layer);
    return { sprite, graphics, rendered: true, spriteScale: 1, facing: RENDER_FACING };
  }

  /** Where `tower`'s shots start now: its barrel tips, turned with the turret to the sim's heading. */
  private muzzlesOf(tower: Tower): Pixel[] {
    return muzzlePoints(this.renderOf(tower.kind), towerCenter(tower), tower.heading);
  }

  /** A tower drawn from `render`: its hull as the base, its turret turning around the pivot, a Graphics over both. */
  private addRenderedTowerView(render: RenderedSprite, at: Pixel): EntityView & { base: Phaser.GameObjects.Image } {
    const { scale, turretOrigin, turretOffset } = renderPlacement(render);
    const base = onLayer(this.add.image(at.x, at.y, render.hullKey), 'towers').setScale(scale);
    const sprite = onLayer(this.add.image(at.x + turretOffset.x, at.y + turretOffset.y, render.turretKey), 'towers')
      .setOrigin(turretOrigin.x, turretOrigin.y)
      .setScale(scale);
    const graphics = onLayer(this.add.graphics(), 'towers').setPosition(at.x, at.y);
    return { base, sprite, graphics, rendered: true, spriteScale: scale, facing: RENDER_FACING };
  }

  /** The enemy card open now, for the test view. */
  private enemyCardView(): TestView['enemyCard'] {
    const enemy = this.sim.state.enemies.find((e) => e.id === this.enemyCard.shownId);
    if (!enemy) return null;
    return {
      enemyId: enemy.id,
      kind: enemy.kind,
      name: ENEMY_NAMES[enemy.kind],
      pinned: this.enemyCard.pinnedId === enemy.id,
    };
  }

  /**
   * The map: its painted ground image and the grid over it (#312). Without the image, the tileset: ground and road
   * tiles, the grid, then decorations over it. Flat shapes instead when the atlas lacks any tileset frame. Returns
   * which it drew.
   */
  private drawMapView(): TestView['mapTiles'] {
    const { map } = this.sim.state;
    const groundKey = groundTextureKey(this.mapId);
    if (this.textures.exists(groundKey)) {
      // The image has more pixels than the map (so zooming in stays sharp): fit it to the grid.
      const image = this.add.image(0, 0, groundKey).setOrigin(0, 0);
      onLayer(image.setDisplaySize(map.cols * TILE_PX, map.rows * TILE_PX), 'map');
      drawGrid(onLayer(this.add.graphics(), 'map'), map);
      return 'image';
    }
    if (!TILESET_FRAMES.every((frame) => this.atlasFrame(frame) !== null)) {
      drawMap(onLayer(this.add.graphics(), 'map'), map);
      return 'shapes';
    }
    const art = tileArt(map);
    const stamp = (tile: Tile, frame: string) => {
      const { x, y } = toPixels(tileCenter(tile));
      return new Phaser.GameObjects.Image(this, x, y, ATLAS_KEY, frame).setScale(SPRITE_SCALE);
    };
    // The ground never changes, so it is drawn once onto one texture: a game object per tile slows every frame.
    const ground = onLayer(this.add.renderTexture(0, 0, map.cols * TILE_PX, map.rows * TILE_PX).setOrigin(0, 0), 'map');
    const stamps = art.map(({ tile, ground: frame, tint }) => {
      const image = stamp(tile, frame);
      if (tint !== undefined) image.setTint(tint);
      return image;
    });
    ground.draw(stamps);
    stamps.forEach((image) => image.destroy());
    drawGrid(onLayer(this.add.graphics(), 'map'), map);
    for (const { tile, decoration } of art) {
      if (decoration !== null) onLayer(this.add.existing(stamp(tile, decoration)), 'map');
    }
    return 'sprites';
  }

  /** The music controller `main.ts` keeps in the registry; none when the scene runs without it. */
  private music(): MusicController | undefined {
    return this.registry.get(MUSIC_REGISTRY_KEY) as MusicController | undefined;
  }

  /**
   * Plays the sim's events as sounds (#45). Test mode is silent, so e2e runs don't change. Otherwise each sound is
   * throttled, waits for the browser's first input, plays at the mix's SFX volume (#67) and stays silent if its file didn't
   * load. A shot sounds like the map defender's weapon, and a sound with a place on the map is quieter the further it is
   * from the camera's centre (#404). The music ducks under a radio cue (#396), on a real-time timer, since the cue plays
   * on after a restart or a speed change.
   */
  private wireSounds(): void {
    const music = this.music();
    const radio = this.flags.test
      ? undefined
      : duckForRadio(
          throttleAudio(
            createPhaserAudio(
              this.sound,
              (key) => this.cache.audio.exists(key),
              () => this.audioMix.volume('sfx'),
            ),
            SOUND_THROTTLE,
            () => this.time.now,
            SOUND_THROTTLE_BY_ID,
          ),
          music ?? { setDucked: () => {} },
          RADIO_CUE_MS,
          (ms, run) => {
            const id = window.setTimeout(run, ms);
            return () => window.clearTimeout(id);
          },
        );
    const audio = radio ?? silentAudio;
    if (radio) this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => radio.dispose());
    // The map actually played (a loaded scenario's own map included); one outside the registry falls back to the selected map.
    const defenderOf = (): Faction =>
      (MAPS.find((m) => m.id === this.sim.state.map.id) ?? mapById(this.mapId)).defender;
    const play = (event: SoundEvent, at?: Position): void => {
      const id = soundFor(event, defenderOf());
      if (id === null) return;
      if (at === undefined) return audio.play(id);
      const camera = this.cameras.main;
      const center = viewCenter(camera, TILE_PX);
      audio.play(id, distanceVolume(Math.hypot(at.x - center.x, at.y - center.y), SOUND_FALLOFF));
    };
    const towerOf = (towerId: number): Tower | undefined => this.sim.state.towers.find((t) => t.id === towerId);
    const shot = (type: 'towerFired' | 'shellFired', towerId: number): void => {
      const tower = towerOf(towerId);
      play({ type, kind: tower?.kind }, tower && tileCenter(tower.tile));
    };
    const { events } = this.sim;
    events.on('towerFired', ({ towerId }) => shot('towerFired', towerId));
    events.on('shellFired', ({ towerId }) => shot('shellFired', towerId));
    events.on('shellLanded', ({ position }) => play({ type: 'shellLanded' }, position));
    events.on('enemyKilled', ({ enemy }) => play({ type: 'enemyKilled', enemy: enemy.kind }, enemy.position));
    events.on('waveStarted', ({ holdovers }) => play({ type: 'waveStarted', holdovers }));
    for (const type of ['enemyLeaked', 'victory', 'defeat'] as const) {
      events.on(type, () => play({ type }));
    }
    // The mortar's incoming whistle, half a second before each shell lands, on the sim's clock.
    const whistles = createWhistleTracker(WHISTLE_LEAD_MS);
    this.playWhistles = () => {
      const { shells, timeMs } = this.sim.state;
      for (const shell of whistles.due(shells, timeMs)) play({ type: 'shellIncoming' }, shell.target);
    };
  }

  /** Phaser passes the data `scene.start('Game', { mapId })` was given; a restart passes the same again. */
  init(data: { readonly mapId?: string } = {}): void {
    if (data.mapId !== undefined) this.mapId = mapById(data.mapId).id;
  }

  create(): void {
    // Restart reruns create() on this same object. Sim ids start again at 1, so last game's ids must not linger here.
    this.previousPositions = new Map();
    this.animMs = 0;
    this.pointerTile = undefined;
    this.hoveredRingKey = undefined;
    this.selectedRingKey = undefined;
    this.allRingIds = [];
    this.allRingsKey = '';
    this.ghost = undefined;
    this.sim = setUpGame({ map: mapById(this.mapId).data, ...this.setup });
    this.result = undefined;
    // A Victory records its Stars against the map played (a loaded scenario's own map included); Defeat records nothing.
    const { lives: startLives, map } = this.sim.state;
    this.sim.events.on('victory', ({ lives }) => {
      // Victory always leaves Lives, so at least 1 star.
      const stars = starsFor(lives, startLives);
      if (stars !== 0) this.result = this.recordWin(map.id, stars);
    });
    this.gameSpeed = this.settings.get().defaultSpeed;
    this.mapTiles = this.drawMapView();
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      // Scaled with ?speed and the fastest game speed, so the cap doesn't pull a faster loop back to real time.
      maxStepsPerFrame: MAX_TICKS_PER_FRAME * Math.ceil(this.flags.speed) * MAX_GAME_SPEED,
      step: () => this.tickOnce(),
    });

    this.enemyViews = createViewSync<Enemy, EnemyView>({
      create: (enemy) => {
        const layer = enemy.layer === 'air' ? 'air' : 'enemies';
        const render = this.renderOf(enemy.kind);
        return {
          ...(render === null
            ? this.addEntityView(enemy.kind, layer, { x: 0, y: 0 }, SPRITE_HEADING[enemy.kind])
            : this.addRenderedEnemyView(render, layer)),
          id: enemy.id,
          kind: enemy.kind,
          hp: Number.NaN,
          frame: 0,
          heading: SPRITE_HEADING[enemy.kind],
        };
      },
      update: (view, enemy) => {
        // ?anim=0 never advances the clock, but the per-id phase would still spread frames, so pin them to 0.
        const frame = this.flags.anim ? animFrame(this.animMs, enemy.id) : 0;
        // Only the shape's rotor moves with the frame; a sprite's HP bar doesn't.
        const redrawShape = !view.sprite && view.frame !== frame;
        if (view.hp !== enemy.hp || redrawShape) {
          view.graphics.clear();
          if (view.sprite) drawHpBar(view.graphics, enemy);
          else drawEnemy(view.graphics, enemy, rotorAngle(frame));
          view.hp = enemy.hp;
        }
        view.frame = frame;
        view.heading = headingOf(this.previousPositions.get(enemy.id), enemy.position, view.heading);
        const { x, y } = toPixels(interpolatePosition(this.previousPositions, enemy, this.loop.alpha));
        view.graphics.setPosition(x, y);
        view.sprite
          ?.setPosition(x, y)
          .setRotation(spriteRotation(view.facing, view.heading))
          .setScale(view.spriteScale * bobScale(frame));
      },
      destroy: (view) => {
        view.graphics.destroy();
        view.sprite?.destroy();
      },
    });

    this.towerViewById.clear();
    this.towerViews = createViewSync<Tower, TowerView>({
      create: (tower) => {
        const at = towerCenter(tower);
        const render = this.renderOf(tower.kind);
        const view: TowerView = {
          towerId: tower.id,
          kind: tower.kind,
          ...(render === null ? this.addKenneyTowerView(tower.kind, at) : this.addRenderedTowerView(render, at)),
          level: 0,
          ring: onLayer(this.add.graphics(), 'towers').setPosition(at.x, at.y),
          angle: tower.heading,
        };
        this.towerViewById.set(tower.id, view);
        return view;
      },
      // The turret is drawn at the sim's heading: the sim turns it toward its target and fires only once it faces it.
      // Redrawn only when an upgrade changes the level pips; a dismantling tower is faded, with a shrinking ring.
      update: (view, tower) => {
        const dismantling = tower.dismantleMs !== undefined;
        view.angle = tower.heading;
        view.sprite?.setRotation(spriteRotation(view.facing, view.angle));
        view.graphics.setAlpha(dismantling ? DISMANTLE.alpha : 1);
        view.sprite?.setAlpha(dismantling ? DISMANTLE.alpha : 1);
        view.base?.setAlpha(dismantling ? DISMANTLE.alpha : 1);
        view.ring.clear();
        if (dismantling) drawDismantleRing(view.ring, tower.dismantleMs! / DISMANTLE_MS);
        if (view.level === tower.level) return;
        view.level = tower.level;
        view.graphics.clear();
        if (view.sprite) drawLevelPips(view.graphics, tower);
        else drawTower(view.graphics, tower);
      },
      destroy: (view) => {
        view.graphics.destroy();
        view.sprite?.destroy();
        view.base?.destroy();
        view.ring.destroy();
        this.towerViewById.delete(view.towerId);
      },
    });

    // ?anim=0: zero lifetimes, so effects, tracers and floating texts never show.
    this.effects = createEffects(this.flags.anim ? EFFECT.lifeMs : 0);
    this.effectGraphics = onLayer(this.add.graphics(), 'effects');
    this.sim.events.on('shellFired', ({ towerId }) => {
      const tower = this.sim.state.towers.find((t) => t.id === towerId);
      if (tower) for (const at of this.muzzlesOf(tower)) this.effects.add('muzzleFlash', at);
    });
    this.sim.events.on('shellLanded', ({ position }) => this.effects.add('explosion', toPixels(position)));
    this.sim.events.on('enemyKilled', ({ enemy }) => this.effects.add('puff', toPixels(enemy.position)));
    this.tracers = createTracers(this.flags.anim ? TRACER.fadeMs : 0);
    this.tracerGraphics = onLayer(this.add.graphics(), 'tracers');
    this.sim.events.on('towerFired', (shot) => {
      const tower = this.sim.state.towers.find((t) => t.id === shot.towerId);
      if (!tower) return;
      for (const at of this.muzzlesOf(tower)) {
        this.tracers.add(at, toPixels(shot.position), tower.kind);
        this.effects.add('muzzleFlash', at);
      }
    });

    this.wireSounds();

    // The shell is game state, so it is always drawn; only its blast is cosmetic, and goes with ?anim=0.
    this.blasts = createBlasts(this.flags.anim ? SHELL.blastFadeMs : 0);
    this.shellGraphics = onLayer(this.add.graphics(), 'shells');
    this.sim.events.on('shellLanded', ({ position, outerRadius }) =>
      this.blasts.add(toPixels(position), outerRadius * TILE_PX),
    );

    this.rangeRing = onLayer(this.add.graphics(), 'rangeRing').setVisible(false);
    this.selectedRing = onLayer(this.add.graphics(), 'rangeRing').setVisible(false);
    this.allRings = onLayer(this.add.graphics(), 'rangeRing');
    this.input.on('gameout', () => {
      this.pointerTile = undefined;
      this.pointerPoint = undefined;
    });

    this.ghostGraphics = onLayer(this.add.graphics(), 'ghost').setVisible(false);
    this.floatingTexts = createFloatingTexts(this.flags.anim ? FLOATING_TEXT : { ...FLOATING_TEXT, durationMs: 0 });
    this.floatingTextViews = createViewSync<FloatingTextView, Phaser.GameObjects.Text>({
      create: ({ text }) => onLayer(this.add.text(0, 0, text, FLOATING_TEXT.style).setOrigin(0.5, 1), 'floatingText'),
      update: (view, { x, y, alpha }) => view.setPosition(x, y).setAlpha(alpha),
      destroy: (view) => view.destroy(),
    });
    this.setUpCamera();

    this.sim.events.on('towerSold', ({ tile, refund }) =>
      this.floatingTexts.add(`+${refund}`, toPixels(tileCenter(tile))),
    );

    const speed: GameSpeedControl = {
      get: () => this.gameSpeed,
      set: (value) => (this.gameSpeed = value),
    };
    this.hud = mountHud(this.hudRoot, this.sim, speed);
    // Placing a new tower, inspecting a placed one and inspecting an enemy are exclusive: picking one closes the others.
    this.buildBar = mountBuildBar(
      this.buildBarRoot,
      this.sim,
      buildOptions((render) => this.textures.exists(render.hullKey) && this.textures.exists(render.turretKey)),
      {
        onSelect: () => {
          this.towerPanel.select(undefined);
          this.enemyCard.pin(undefined);
        },
        atlas: this.iconAtlas(),
      },
    );
    // Restart: Phaser destroys the scene's display objects and input listeners, then create() builds a fresh sim.
    this.endScreen = mountEndScreen(this.endScreenRoot, this.sim, {
      onRestart: () => this.scene.restart(),
      onLevelSelect: () => this.scene.start('LevelSelect'),
      result: () => this.result,
    });
    this.towerPanel = mountTowerPanel(this.towerPanelRoot, this.sim, {
      onSelect: () => {
        this.buildBar.clear();
        this.enemyCard.pin(undefined);
      },
    });
    this.enemyCard = mountEnemyCard(this.enemyCardRoot, this.sim, { onPin: () => this.towerPanel.select(undefined) });
    // A full freeze: the overlay covers the map and the HUD, build bar and tower panel go inert. Mounted last, so the
    // build bar's, tower panel's and enemy card's Esc (cancel a selection) runs before its own (pause).
    this.pauseMenu = mountPauseMenu(this.pauseMenuRoot, this.sim, {
      buttonRoot: this.hud.controls,
      blocked: [this.hudRoot, this.buildBarRoot, this.towerPanelRoot, this.enemyCardRoot],
      onRestart: () => this.scene.restart(),
      onQuit: () => this.scene.start('LevelSelect'),
      openSettings: this.openSettings,
      speed,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      this.buildBar.destroy();
      this.endScreen.destroy();
      this.towerPanel.destroy();
      this.enemyCard.destroy();
      this.pauseMenu.destroy();
    });
    this.onCreate?.();
  }

  /** Saves a win of `mapId` and says what it earned, including the next map when this win unlocked it. */
  private recordWin(mapId: string, stars: WinStars): VictoryResult {
    const index = MAPS.findIndex((entry) => entry.id === mapId);
    const unlocks = unlocksNext(
      index,
      MAPS.map((entry) => entry.id),
      this.progress.get(),
    );
    this.progress.recordResult(mapId, stars);
    return unlocks ? { stars, unlockedMap: MAPS[index + 1]!.name } : { stars };
  }

  /** The camera's limits now: the canvas size and the map's size in world pixels. */
  private cameraBounds(): CameraBounds {
    const { map } = this.sim.state;
    return {
      viewport: { width: this.scale.width, height: this.scale.height },
      world: { width: map.cols * TILE_PX, height: map.rows * TILE_PX },
      maxZoom: CAMERA.maxZoom,
    };
  }

  private setView(view: CameraView): void {
    this.view = view;
    this.cameras.main.setZoom(view.zoom).setScroll(view.scrollX, view.scrollY);
  }

  /**
   * The map starts zoomed to fit the canvas, which fills the window. A drag pans it and the wheel or a pinch zooms
   * it; only a tap (a press that doesn't move) acts on the map, so moving the map never places a tower. The one
   * exception is touch: with a kind selected, a one-finger drag moves the Ghost and lifting places the tower.
   */
  private setUpCamera(): void {
    // Origin at the top-left corner, so a screen pixel shows the world point `scroll + screen / zoom` (camera.ts).
    this.cameras.main.setOrigin(0, 0);
    this.fitted = true;
    this.setView(fitView(this.cameraBounds()));
    const onResize = (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
      const bounds = this.cameraBounds();
      this.setView(this.fitted ? fitView(bounds) : clampView(this.view, bounds));
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));

    // A touch drag places a tower when a tap would: a kind is selected and the panels over the map (the tower panel
    // and the enemy card) are closed.
    this.gestures = createGestures({
      dragThresholdPx: CAMERA.dragThresholdPx,
      placing: () =>
        this.buildBar.selected !== undefined &&
        this.towerPanel.selectedId === undefined &&
        this.enemyCard.pinnedId === undefined,
    });
    const screen = (pointer: Phaser.Input.Pointer): Pixel => ({ x: pointer.x, y: pointer.y });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // The pause overlay covers the canvas; this guards a press that lands anyway.
      if (pointer.button !== 0 || this.pauseMenu.paused) return;
      this.onGesture(this.gestures.down(pointer.id, screen(pointer), pointer.wasTouch));
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const gesture = this.gestures.move(pointer.id, screen(pointer));
      this.onGesture(gesture);
      // A finger hovers only while it aims; a pinch or pan moves the camera and shows no Ghost.
      const hover = hoverFrom(gesture, pointer.wasTouch);
      if (hover === 'follow') {
        this.pointerPoint = screenToWorld(this.view, screen(pointer));
        this.pointerTile = pixelToTile(this.pointerPoint);
      } else {
        this.pointerPoint = undefined;
        if (hover === 'clear') this.pointerTile = undefined;
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.onGesture(this.gestures.up(pointer.id, screen(pointer)));
      // A lifted finger hovers nothing, so it leaves no Ghost or range ring behind; a mouse still hovers.
      if (pointer.wasTouch) this.pointerTile = undefined;
    });
    // Released off the canvas, or over the build bar beside it: never a tap or a placement.
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      this.gestures.cancel();
      if (pointer.wasTouch) this.pointerTile = undefined;
    });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.fitted = false;
      this.setView(zoomAt(this.view, Math.exp(-dy * CAMERA.wheelZoomPerPx), screen(pointer), this.cameraBounds()));
    });
  }

  private onGesture(gesture: Gesture | undefined): void {
    if (!gesture) return;
    if (gesture.type === 'tap')
      return this.tapAt(screenToWorld(this.view, gesture.point), this.pointOnMap(gesture.point));
    if (gesture.type === 'aim') {
      this.pointerTile = pixelToTile(screenToWorld(this.view, gesture.point));
      return;
    }
    if (gesture.type === 'place') {
      // A lift off the visible map (over the HUD, at the screen edge) places nothing.
      if (this.pointOnMap(gesture.point)) this.placeAtPoint(screenToWorld(this.view, gesture.point));
      return;
    }
    this.fitted = false;
    const bounds = this.cameraBounds();
    const panned = panBy(this.view, gesture.dx, gesture.dy, bounds);
    this.setView(gesture.type === 'pinch' ? zoomAt(panned, gesture.factor, gesture.center, bounds) : panned);
  }

  /** The enemy under world pixel `at`: its hit area is at least `ENEMY_HIT_PX` across on screen, at any zoom. */
  private enemyUnder(at: Pixel): Enemy | undefined {
    return enemyAt(this.sim.state.enemies, at, ENEMY_HIT_PX / 2 / this.view.zoom);
  }

  /**
   * A tap on the map at world pixel `at`. A tap on a tower selects it, and one on an enemy opens its card. Otherwise
   * the sim decides whether it places one, so this works in the Build and Wave phases alike.
   */
  private tapAt(at: Pixel, canPlace: boolean): void {
    const action = resolveClick(
      this.sim.state.towers,
      this.towerPanel.selectedId,
      pixelToTile(at),
      this.buildBar.selected,
      {
        enemyId: this.enemyUnder(at)?.id,
        cardOpen: this.enemyCard.pinnedId !== undefined,
      },
    );
    if (action.type === 'select') this.towerPanel.select(action.towerId);
    else if (action.type === 'inspect') this.enemyCard.pin(action.enemyId);
    else if (action.type === 'deselect') {
      this.towerPanel.select(undefined);
      this.enemyCard.pin(undefined);
    } else if (action.type === 'place' && canPlace) {
      const refusal = placeAt(this.sim, action.kind, action.tile);
      if (refusal) this.floatingTexts.add(refusal, at);
    }
  }

  /** True when the screen point is on the visible map, so a placement may land there. */
  private pointOnMap(screenPoint: Pixel): boolean {
    return canPlaceAt(this.view, this.cameraBounds(), screenPoint);
  }

  /** Places the selected kind on the tile at world pixel `at`, where an aiming drag lifted. */
  private placeAtPoint(at: Pixel): void {
    const kind = this.buildBar.selected;
    if (!kind) return;
    const refusal = placeAt(this.sim, kind, pixelToTile(at));
    if (refusal) this.floatingTexts.add(refusal, at);
  }

  /** One fixed tick of the game, from the real-time loop or test mode's step(). */
  private tickOnce(): void {
    this.previousPositions = snapshotPositions(this.sim.state.enemies);
    this.sim.tick(TICK_MS);
  }

  override update(_time: number, frameDeltaMs: number): void {
    // Paused, no time passes: the sim doesn't tick and the cosmetics hold still (ADR-0002: the sim is untouched).
    const deltaMs = this.pauseMenu.paused ? 0 : frameDeltaMs;
    // Age tracers before ticking, so one fired this frame is drawn fully opaque.
    this.tracers.advance(deltaMs);
    this.blasts.advance(deltaMs);
    this.effects.advance(deltaMs);
    this.floatingTexts.advance(deltaMs);
    if (this.flags.anim) this.animMs += deltaMs;
    this.loop.advance(frameMs(this.flags, deltaMs, this.gameSpeed));
    this.playWhistles();
    // The battlefield ambience (#405): the combat layer during a wave, the game track on the End screen. Both calls do
    // nothing while nothing changes; a restart goes back to the bed through the scene's START.
    const { scene, combat } = gameMusic(this.sim.state.phase);
    this.music()?.enterScene(scene);
    this.music()?.setCombat(combat);
    this.hud.update();
    this.buildBar.update();
    this.endScreen.update();
    this.towerPanel.update();
    // A mouse over an enemy shows its card, unless the tower panel holds that spot.
    const hoveredEnemy =
      this.pointerPoint && this.towerPanel.selectedId === undefined ? this.enemyUnder(this.pointerPoint) : undefined;
    this.enemyCard.hover(hoveredEnemy?.id);
    this.enemyCard.update();
    this.pauseMenu.update();

    const { enemies, towers } = this.sim.state;
    this.towerViews.sync(towers);
    this.enemyViews.sync(enemies);
    this.tracerGraphics.clear();
    drawTracers(this.tracerGraphics, this.tracers.active());
    this.effectGraphics.clear();
    drawEffects(this.effectGraphics, this.effects.active());
    const { selectedId } = this.towerPanel;
    const selected = towers.find((tower) => tower.id === selectedId);
    this.selectedRingKey = this.showRing(this.selectedRing, this.selectedRingKey, selected, true);
    this.shellGraphics.clear();
    const { shells, timeMs } = this.sim.state;
    drawShells(
      this.shellGraphics,
      shells.map((shell) =>
        shellPoint({ ...shell, from: toPixels(shell.from), target: toPixels(shell.target) }, timeMs),
      ),
    );
    drawBlasts(this.shellGraphics, this.blasts.active());
    // Every frame too, so a setting switched on the Settings screen shows at once.
    const { showAllRanges } = this.settings.get();
    this.showAllRings(showAllRanges ? towers.filter((tower) => tower !== selected) : []);
    // Checked every frame, not only on pointer moves, so a tower that appears under a still pointer shows its ring.
    // The selected tower's ring is drawn already, and with Always show tower ranges every other one is too.
    const hovered = this.pointerTile && towerAt(towers, this.pointerTile);
    this.hoveredRingKey = this.showRing(
      this.rangeRing,
      this.hoveredRingKey,
      hovered === selected || showAllRanges ? undefined : hovered,
    );
    // Every frame too, so the ghost turns green when Money arrives under a still pointer.
    // None while a tower is selected, since a click then only deselects.
    const kind = this.buildBar.selected;
    this.showGhost(kind, selected ? undefined : ghostAt(this.sim, kind, this.pointerTile));
    this.floatingTextViews.sync(this.floatingTexts.active());
  }

  /**
   * Draws the range ring of `tower` on `ring`, or hides it when there is none. `drawnKey` is the `ringKey` of the
   * ring shown now, so an unchanged ring isn't redrawn. A `selected` tower also gets the selection brackets. Returns
   * the key it shows after.
   */
  private showRing(
    ring: Phaser.GameObjects.Graphics,
    drawnKey: string | undefined,
    tower: Tower | undefined,
    selected = false,
  ): string | undefined {
    const key = tower && ringKey(tower);
    if (key === drawnKey) return drawnKey;
    ring.clear().setVisible(tower !== undefined);
    if (!tower) return undefined;
    const { x, y } = towerCenter(tower);
    drawRangeRing(ring.setPosition(x, y), tower);
    if (selected) drawSelection(ring);
    return key;
  }

  /** Draws the range rings of `towers` on `allRings`, redrawing only when the towers or their ranges change. */
  private showAllRings(towers: readonly Tower[]): void {
    const key = towers.map(ringKey).join(',');
    if (key === this.allRingsKey) return;
    this.allRingsKey = key;
    this.allRingIds = towers.map((tower) => tower.id);
    this.allRings.clear();
    for (const tower of towers) {
      const { x, y } = towerCenter(tower);
      this.allRings.translateCanvas(x, y);
      drawRangeRing(this.allRings, tower);
      this.allRings.translateCanvas(-x, -y);
    }
  }

  /** Draws `ghost` as a `kind` tower on its tile, or hides it when there is none or no kind is selected. */
  private showGhost(kind: TowerKind | undefined, ghost: Ghost | undefined): void {
    const shown = kind && ghost ? { ...ghost, kind } : undefined;
    const unchanged = shown
      ? shown.kind === this.ghost?.kind &&
        shown.tile.col === this.ghost.tile.col &&
        shown.tile.row === this.ghost.tile.row &&
        shown.placeable === this.ghost.placeable
      : this.ghost === undefined;
    if (unchanged) return;
    this.ghost = shown;
    this.ghostGraphics.clear().setVisible(shown !== undefined);
    if (!shown) return;
    const { x, y } = toPixels(tileCenter(shown.tile));
    drawGhost(this.ghostGraphics.setPosition(x, y), shown.kind, shown.placeable);
  }
}
