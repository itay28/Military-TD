import Phaser from 'phaser';
import { CAMERA, DISMANTLE, FLOATING_TEXT, SHELL, SPRITE_SCALE, TILE_PX, TRACER } from '../data/display';
import { ATLAS_KEY, TILE_TYPES, spriteFor, type SpriteKind } from '../data/sprites';
import { DISMANTLE_MS, type TowerKind } from '../data/towers';
import { MAPS, mapById } from '../data/maps';
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
import { clampView, fitView, panBy, screenToWorld, zoomAt, type CameraBounds, type CameraView } from './camera';
import { pixelToTile, toPixels, type Pixel } from './coords';
import {
  drawBlasts,
  drawDismantleRing,
  drawEnemy,
  drawGhost,
  drawHpBar,
  drawLevelPips,
  drawRangeRing,
  drawShells,
  drawTower,
  drawTracers,
} from './drawEntities';
import { drawGrid, drawMap, tileType } from './drawMap';
import { createFixedStep, type FixedStep } from './fixedStep';
import { MAX_GAME_SPEED, type GameSpeed } from './gameSpeed';
import { createGestures, type Gesture, type Gestures } from './gestures';
import { createFloatingTexts, type FloatingTexts, type FloatingTextView } from './floatingTexts';
import { interpolatePosition, snapshotPositions } from './interpolate';
import { ghostAt, placeAt, type Ghost } from './placement';
import { resolveClick } from './selection';
import { createBlasts, shellPoint, type Blasts } from './shellView';
import { createTracers, type Tracers } from './tracers';
import { buildOptions, mountBuildBar, type BuildBar } from '../ui/buildBar';
import { mountEndScreen, type EndScreen, type VictoryResult } from '../ui/endScreen';
import { mountHud, type Hud } from '../ui/hud';
import { mountPauseMenu, type PauseMenu } from '../ui/pauseMenu';
import type { OpenSettings } from '../ui/settingsScreen';
import { mountTowerPanel, type TowerPanel } from '../ui/towerPanel';
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

/** An enemy or tower: its sprite, if it has one, and a Graphics over it with its shape or just its overlays. */
interface EntityView {
  readonly sprite: Phaser.GameObjects.Image | undefined;
  readonly graphics: Phaser.GameObjects.Graphics;
}

interface EnemyView extends EntityView {
  /** The HP last drawn, so the bar is redrawn only when it changes. */
  hp: number;
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
  /** The DOM element over the canvas the pause menu is drawn in (`#pause-menu` in index.html). */
  readonly pauseMenuRoot: HTMLElement;
  /** Test mode's URL flags (ADR-0003). */
  readonly flags: TestFlags;
  /** The player's settings, read live: each game starts at the default speed, and range rings follow every frame. */
  readonly settings: SettingsStore;
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
  private readonly pauseMenuRoot: HTMLElement;
  private readonly flags: TestFlags;
  private readonly settings: SettingsStore;
  private readonly openSettings: OpenSettings;
  private readonly progress: ProgressStore;
  private readonly onCreate: (() => void) | undefined;
  /** How each game starts, the first and every restart. Test mode's loadScenario changes it. */
  private setup: GameSetup = {};
  /** The map picked on the Level select, kept across restarts. A loaded scenario's own map overrides it. */
  private mapId: string = MAPS[0]!.id;
  private sim!: Game;
  private loop!: FixedStep;
  /** The player's game speed. Each game starts at the default speed in the settings. */
  private gameSpeed: GameSpeed = 1;
  private hud!: Hud;
  private buildBar!: BuildBar;
  private endScreen!: EndScreen;
  /** What this game's Victory earned, once it is won. */
  private result: VictoryResult | undefined;
  private towerPanel!: TowerPanel;
  private pauseMenu!: PauseMenu;
  private enemyViews!: ViewSync<Enemy>;
  private towerViews!: ViewSync<Tower>;
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
  /** The tile under the pointer, or undefined when it is off the canvas. */
  private pointerTile: Tile | undefined;
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
    pauseMenuRoot,
    flags,
    settings,
    openSettings,
    progress,
    onCreate,
  }: GameSceneOptions) {
    super('Game');
    this.hudRoot = hudRoot;
    this.buildBarRoot = buildBarRoot;
    this.endScreenRoot = endScreenRoot;
    this.towerPanelRoot = towerPanelRoot;
    this.pauseMenuRoot = pauseMenuRoot;
    this.flags = flags;
    this.settings = settings;
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
      ghost: { visible: this.ghostGraphics.visible, tile: this.ghost?.tile ?? null },
      camera: { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom },
      drawOrder: layers.filter((name, i) => name !== layers[i - 1]),
      sprites: this.textures.exists(ATLAS_KEY),
    };
  }

  /** The atlas frame `kind` is drawn with, or null to draw its shape: it has none, or the atlas didn't load. */
  private frameFor(kind: SpriteKind): string | null {
    const frame = spriteFor(kind);
    if (frame === null || !this.textures.exists(ATLAS_KEY)) return null;
    return this.textures.get(ATLAS_KEY).has(frame) ? frame : null;
  }

  /** A sprite of `kind` and a Graphics over it on `layer`, both at `at`; no sprite when `kind` has no frame. */
  private addEntityView(kind: SpriteKind, layer: keyof typeof DEPTH, { x, y }: Pixel): EntityView {
    const frame = this.frameFor(kind);
    // Made first, so the Graphics on the same layer draws over it.
    const sprite = frame === null ? undefined : onLayer(this.add.image(x, y, ATLAS_KEY, frame), layer);
    sprite?.setScale(SPRITE_SCALE);
    return { sprite, graphics: onLayer(this.add.graphics(), layer).setPosition(x, y) };
  }

  /** The map's tiles as sprites with the grid on top, or as shapes when the atlas lacks a tile frame. */
  private drawMapView(): void {
    const { map } = this.sim.state;
    if (!TILE_TYPES.every((type) => this.frameFor(type) !== null))
      return drawMap(onLayer(this.add.graphics(), 'map'), map);
    // The tiles never change, so they are drawn once onto one texture: a game object per tile slows every frame.
    const tiles = onLayer(this.add.renderTexture(0, 0, map.cols * TILE_PX, map.rows * TILE_PX).setOrigin(0, 0), 'map');
    const stamps: Phaser.GameObjects.Image[] = [];
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const { x, y } = toPixels(tileCenter({ col, row }));
        const frame = this.frameFor(tileType(map, { col, row }))!;
        stamps.push(new Phaser.GameObjects.Image(this, x, y, ATLAS_KEY, frame).setScale(SPRITE_SCALE));
      }
    }
    tiles.draw(stamps);
    stamps.forEach((stamp) => stamp.destroy());
    drawGrid(onLayer(this.add.graphics(), 'map'), map);
  }

  /** Phaser passes the data `scene.start('Game', { mapId })` was given; a restart passes the same again. */
  init(data: { readonly mapId?: string } = {}): void {
    if (data.mapId !== undefined) this.mapId = mapById(data.mapId).id;
  }

  create(): void {
    // Restart reruns create() on this same object. Sim ids start again at 1, so last game's ids must not linger here.
    this.previousPositions = new Map();
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
    this.drawMapView();
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      // Scaled with ?speed and the fastest game speed, so the cap doesn't pull a faster loop back to real time.
      maxStepsPerFrame: MAX_TICKS_PER_FRAME * Math.ceil(this.flags.speed) * MAX_GAME_SPEED,
      step: () => this.tickOnce(),
    });

    this.enemyViews = createViewSync<Enemy, EnemyView>({
      create: (enemy) => ({
        ...this.addEntityView(enemy.kind, enemy.layer === 'air' ? 'air' : 'enemies', { x: 0, y: 0 }),
        hp: Number.NaN,
      }),
      update: (view, enemy) => {
        if (view.hp !== enemy.hp) {
          view.graphics.clear();
          if (view.sprite) drawHpBar(view.graphics, enemy);
          else drawEnemy(view.graphics, enemy);
          view.hp = enemy.hp;
        }
        const { x, y } = toPixels(interpolatePosition(this.previousPositions, enemy, this.loop.alpha));
        view.graphics.setPosition(x, y);
        view.sprite?.setPosition(x, y);
      },
      destroy: (view) => {
        view.graphics.destroy();
        view.sprite?.destroy();
      },
    });

    this.towerViews = createViewSync({
      create: (tower) => {
        const at = towerCenter(tower);
        return {
          ...this.addEntityView(tower.kind, 'towers', at),
          level: 0,
          ring: onLayer(this.add.graphics(), 'towers').setPosition(at.x, at.y),
        };
      },
      // Redrawn only when an upgrade changes the level pips; a dismantling tower is faded, with a shrinking ring.
      update: (view, tower) => {
        const dismantling = tower.dismantleMs !== undefined;
        view.graphics.setAlpha(dismantling ? DISMANTLE.alpha : 1);
        view.sprite?.setAlpha(dismantling ? DISMANTLE.alpha : 1);
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
        view.ring.destroy();
      },
    });

    // ?anim=0: zero lifetimes, so tracers and floating texts never show.
    this.tracers = createTracers(this.flags.anim ? TRACER.fadeMs : 0);
    this.tracerGraphics = onLayer(this.add.graphics(), 'tracers');
    this.sim.events.on('towerFired', (shot) => {
      const tower = this.sim.state.towers.find((t) => t.id === shot.towerId);
      if (tower) this.tracers.add(towerCenter(tower), toPixels(shot.position), tower.kind);
    });

    // The shell is game state, so it is always drawn; only its blast is cosmetic, and goes with ?anim=0.
    this.blasts = createBlasts(this.flags.anim ? SHELL.blastFadeMs : 0);
    this.shellGraphics = onLayer(this.add.graphics(), 'shells');
    this.sim.events.on('shellLanded', ({ position, outerRadius }) =>
      this.blasts.add(toPixels(position), outerRadius * TILE_PX),
    );

    this.rangeRing = onLayer(this.add.graphics(), 'rangeRing').setVisible(false);
    this.selectedRing = onLayer(this.add.graphics(), 'rangeRing').setVisible(false);
    this.allRings = onLayer(this.add.graphics(), 'rangeRing');
    this.input.on('gameout', () => (this.pointerTile = undefined));

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

    this.hud = mountHud(this.hudRoot, this.sim, {
      get: () => this.gameSpeed,
      set: (speed) => (this.gameSpeed = speed),
    });
    this.buildBar = mountBuildBar(this.buildBarRoot, this.sim, buildOptions());
    // Restart: Phaser destroys the scene's display objects and input listeners, then create() builds a fresh sim.
    this.endScreen = mountEndScreen(this.endScreenRoot, this.sim, {
      onRestart: () => this.scene.restart(),
      result: () => this.result,
    });
    this.towerPanel = mountTowerPanel(this.towerPanelRoot, this.sim);
    // A full freeze: the overlay covers the map and the HUD, build bar and tower panel go inert. Mounted last, so the
    // build bar's and tower panel's Esc (cancel a selection) runs before its own (pause).
    this.pauseMenu = mountPauseMenu(this.pauseMenuRoot, this.sim, {
      buttonRoot: this.hud.controls,
      blocked: [this.hudRoot, this.buildBarRoot, this.towerPanelRoot],
      onRestart: () => this.scene.restart(),
      openSettings: this.openSettings,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      this.buildBar.destroy();
      this.endScreen.destroy();
      this.towerPanel.destroy();
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

    // A touch drag places a tower when a tap would: a kind is selected and no tower is, so the tower panel, the one
    // panel over the map, is closed.
    this.gestures = createGestures({
      dragThresholdPx: CAMERA.dragThresholdPx,
      placing: () => this.buildBar.selected !== undefined && this.towerPanel.selectedId === undefined,
    });
    const screen = (pointer: Phaser.Input.Pointer): Pixel => ({ x: pointer.x, y: pointer.y });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // The pause overlay covers the canvas; this guards a press that lands anyway.
      if (pointer.button !== 0 || this.pauseMenu.paused) return;
      this.onGesture(this.gestures.down(pointer.id, screen(pointer), pointer.wasTouch));
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.onGesture(this.gestures.move(pointer.id, screen(pointer)));
      this.pointerTile = pixelToTile(screenToWorld(this.view, screen(pointer)));
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
    if (gesture.type === 'tap') return this.tapAt(screenToWorld(this.view, gesture.point));
    if (gesture.type === 'aim') {
      this.pointerTile = pixelToTile(screenToWorld(this.view, gesture.point));
      return;
    }
    if (gesture.type === 'place') return this.placeAtPoint(screenToWorld(this.view, gesture.point));
    this.fitted = false;
    const bounds = this.cameraBounds();
    const panned = panBy(this.view, gesture.dx, gesture.dy, bounds);
    this.setView(gesture.type === 'pinch' ? zoomAt(panned, gesture.factor, gesture.center, bounds) : panned);
  }

  /**
   * A tap on the map at world pixel `at`. A tap on a tower selects it. Otherwise the sim decides whether it places
   * one, so this works in the Build and Wave phases alike.
   */
  private tapAt(at: Pixel): void {
    const action = resolveClick(
      this.sim.state.towers,
      this.towerPanel.selectedId,
      pixelToTile(at),
      this.buildBar.selected,
    );
    if (action.type === 'select') this.towerPanel.select(action.towerId);
    else if (action.type === 'deselect') this.towerPanel.select(undefined);
    else if (action.type === 'place') {
      const refusal = placeAt(this.sim, action.kind, action.tile);
      if (refusal) this.floatingTexts.add(refusal, at);
    }
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
    this.floatingTexts.advance(deltaMs);
    this.loop.advance(frameMs(this.flags, deltaMs, this.gameSpeed));
    this.hud.update();
    this.buildBar.update();
    this.endScreen.update();
    this.towerPanel.update();
    this.pauseMenu.update();

    const { enemies, towers } = this.sim.state;
    this.towerViews.sync(towers);
    this.enemyViews.sync(enemies);
    this.tracerGraphics.clear();
    drawTracers(this.tracerGraphics, this.tracers.active());
    const { selectedId } = this.towerPanel;
    const selected = towers.find((tower) => tower.id === selectedId);
    this.selectedRingKey = this.showRing(this.selectedRing, this.selectedRingKey, selected);
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
   * ring shown now, so an unchanged ring isn't redrawn. Returns the key it shows after.
   */
  private showRing(
    ring: Phaser.GameObjects.Graphics,
    drawnKey: string | undefined,
    tower: Tower | undefined,
  ): string | undefined {
    const key = tower && ringKey(tower);
    if (key === drawnKey) return drawnKey;
    ring.clear().setVisible(tower !== undefined);
    if (!tower) return undefined;
    const { x, y } = towerCenter(tower);
    drawRangeRing(ring.setPosition(x, y), tower);
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
