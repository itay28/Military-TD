import Phaser from 'phaser';
import { DISMANTLE, FLOATING_TEXT, TRACER } from '../data/display';
import { DISMANTLE_MS, type TowerKind } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import { TICK_MS, type Game } from '../sim/game';
import { tileCenter, type Position, type Tile } from '../sim/map';
import { setUpGame, type GameSetup } from '../sim/scenario';
import { towerAt, type Tower } from '../sim/towers';
import type { TestHooks } from '../testing/api';
import { frameMs, type TestFlags } from '../testing/flags';
import { pixelToTile, toPixels, type Pixel } from './coords';
import { drawDismantleRing, drawEnemy, drawGhost, drawRangeRing, drawTower, drawTracers } from './drawEntities';
import { drawMap } from './drawMap';
import { createFixedStep, type FixedStep } from './fixedStep';
import { createFloatingTexts, type FloatingTexts, type FloatingTextView } from './floatingTexts';
import { interpolatePosition, snapshotPositions } from './interpolate';
import { ghostAt, placeAt, type Ghost } from './placement';
import { resolveClick } from './selection';
import { createTracers, type Tracers } from './tracers';
import { mountEndScreen, type EndScreen } from '../ui/endScreen';
import { mountHud, type Hud } from '../ui/hud';
import { mountTowerPanel, type TowerPanel } from '../ui/towerPanel';
import { createViewSync, type ViewSync } from './viewSync';

/** Real time keeps up down to about 12 fps; below that the game runs slower instead of spiralling. */
const MAX_TICKS_PER_FRAME = 5;

const towerCenter = (tower: Tower): Pixel => toPixels(tileCenter(tower.tile));
/** What a drawn range ring depends on: the tower, and its range, which an upgrade can change. */
const ringKey = (tower: Tower): string => `${tower.id}@${tower.range}`;

/** Draw order, back to front. */
const DEPTH = { map: 0, towers: 1, enemies: 2, tracers: 3, ghost: 4, rangeRing: 5, floatingText: 6 } as const;

/** The tower kind a click places. The MVP has one; the v0.2 build bar will pick it. */
const PLACING: TowerKind = 'rifleNest';

interface EnemyView {
  readonly graphics: Phaser.GameObjects.Graphics;
  /** The HP last drawn, so the bar is redrawn only when it changes. */
  hp: number;
}

export interface GameSceneOptions {
  /** The DOM element the HUD is drawn in (`#hud` in index.html). */
  readonly hudRoot: HTMLElement;
  /** The DOM element over the canvas the End screen is drawn in (`#end-screen` in index.html). */
  readonly endScreenRoot: HTMLElement;
  /** The DOM element over the canvas the tower panel is drawn in (`#tower-panel` in index.html). */
  readonly towerPanelRoot: HTMLElement;
  /** Test mode's URL flags (ADR-0003). */
  readonly flags: TestFlags;
  /** Called at the end of every create(), the first game's and each restart's. */
  readonly onCreate?: () => void;
}

/** Owns the Simulation, draws it, and advances it on a fixed timestep. */
export class GameScene extends Phaser.Scene {
  private readonly hudRoot: HTMLElement;
  private readonly endScreenRoot: HTMLElement;
  private readonly towerPanelRoot: HTMLElement;
  private readonly flags: TestFlags;
  private readonly onCreate: (() => void) | undefined;
  /** How each game starts, the first and every restart. Test mode's loadScenario changes it. */
  private setup: GameSetup = {};
  private sim!: Game;
  private loop!: FixedStep;
  private hud!: Hud;
  private endScreen!: EndScreen;
  private towerPanel!: TowerPanel;
  private enemyViews!: ViewSync<Enemy>;
  private towerViews!: ViewSync<Tower>;
  private tracers!: Tracers;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private rangeRing!: Phaser.GameObjects.Graphics;
  private selectedRing!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  /** The ghost last drawn, so it is redrawn only when its tile or colour changes. */
  private ghost: Ghost | undefined;
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

  constructor({ hudRoot, endScreenRoot, towerPanelRoot, flags, onCreate }: GameSceneOptions) {
    super('Game');
    this.hudRoot = hudRoot;
    this.endScreenRoot = endScreenRoot;
    this.towerPanelRoot = towerPanelRoot;
    this.flags = flags;
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
    };
  }

  create(): void {
    // Restart reruns create() on this same object. Sim ids start again at 1, so last game's ids must not linger here.
    this.previousPositions = new Map();
    this.pointerTile = undefined;
    this.hoveredRingKey = undefined;
    this.selectedRingKey = undefined;
    this.ghost = undefined;
    this.sim = setUpGame(this.setup);
    drawMap(this.add.graphics().setDepth(DEPTH.map), this.sim.state.map);
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      // Scaled with ?speed, so the cap doesn't pull a faster loop back to real time.
      maxStepsPerFrame: MAX_TICKS_PER_FRAME * Math.ceil(this.flags.speed),
      step: () => this.tickOnce(),
    });

    this.enemyViews = createViewSync<Enemy, EnemyView>({
      create: () => ({ graphics: this.add.graphics().setDepth(DEPTH.enemies), hp: Number.NaN }),
      update: (view, enemy) => {
        if (view.hp !== enemy.hp) {
          view.graphics.clear();
          drawEnemy(view.graphics, enemy);
          view.hp = enemy.hp;
        }
        const { x, y } = toPixels(interpolatePosition(this.previousPositions, enemy, this.loop.alpha));
        view.graphics.setPosition(x, y);
      },
      destroy: (view) => view.graphics.destroy(),
    });

    this.towerViews = createViewSync({
      create: (tower) => {
        const { x, y } = towerCenter(tower);
        return {
          graphics: this.add.graphics().setDepth(DEPTH.towers).setPosition(x, y),
          level: 0,
          ring: this.add.graphics().setDepth(DEPTH.towers).setPosition(x, y),
        };
      },
      // Redrawn only when an upgrade changes the level pips; a dismantling tower is faded, with a shrinking ring.
      update: (view, tower) => {
        const dismantling = tower.dismantleMs !== undefined;
        view.graphics.setAlpha(dismantling ? DISMANTLE.alpha : 1);
        view.ring.clear();
        if (dismantling) drawDismantleRing(view.ring, tower.dismantleMs! / DISMANTLE_MS);
        if (view.level === tower.level) return;
        view.level = tower.level;
        view.graphics.clear();
        drawTower(view.graphics, tower);
      },
      destroy: (view) => {
        view.graphics.destroy();
        view.ring.destroy();
      },
    });

    // ?anim=0: zero lifetimes, so tracers and floating texts never show.
    this.tracers = createTracers(this.flags.anim ? TRACER.fadeMs : 0);
    this.tracerGraphics = this.add.graphics().setDepth(DEPTH.tracers);
    this.sim.events.on('towerFired', (shot) => {
      const tower = this.sim.state.towers.find((t) => t.id === shot.towerId);
      if (tower) this.tracers.add(towerCenter(tower), toPixels(shot.position));
    });

    this.rangeRing = this.add.graphics().setDepth(DEPTH.rangeRing).setVisible(false);
    this.selectedRing = this.add.graphics().setDepth(DEPTH.rangeRing).setVisible(false);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerTile = pixelToTile({ x: pointer.worldX, y: pointer.worldY });
    });
    this.input.on('gameout', () => (this.pointerTile = undefined));

    this.ghostGraphics = this.add.graphics().setDepth(DEPTH.ghost).setVisible(false);
    this.floatingTexts = createFloatingTexts(this.flags.anim ? FLOATING_TEXT : { ...FLOATING_TEXT, durationMs: 0 });
    this.floatingTextViews = createViewSync<FloatingTextView, Phaser.GameObjects.Text>({
      create: ({ text }) =>
        this.add.text(0, 0, text, FLOATING_TEXT.style).setOrigin(0.5, 1).setDepth(DEPTH.floatingText),
      update: (view, { x, y, alpha }) => view.setPosition(x, y).setAlpha(alpha),
      destroy: (view) => view.destroy(),
    });
    // A click on a tower selects it. Otherwise the sim decides whether it places one, so this works in the
    // Build and Wave phases alike.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      const at = { x: pointer.worldX, y: pointer.worldY };
      const action = resolveClick(this.sim.state.towers, this.towerPanel.selectedId, pixelToTile(at));
      if (action.type === 'select') this.towerPanel.select(action.towerId);
      else if (action.type === 'deselect') this.towerPanel.select(undefined);
      else {
        const refusal = placeAt(this.sim, PLACING, action.tile);
        if (refusal) this.floatingTexts.add(refusal, at);
      }
    });

    this.sim.events.on('towerSold', ({ tile, refund }) =>
      this.floatingTexts.add(`+${refund}`, toPixels(tileCenter(tile))),
    );

    this.hud = mountHud(this.hudRoot, this.sim);
    // Restart: Phaser destroys the scene's display objects and input listeners, then create() builds a fresh sim.
    this.endScreen = mountEndScreen(this.endScreenRoot, this.sim, { onRestart: () => this.scene.restart() });
    this.towerPanel = mountTowerPanel(this.towerPanelRoot, this.sim);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      this.endScreen.destroy();
      this.towerPanel.destroy();
    });
    this.onCreate?.();
  }

  /** One fixed tick of the game, from the real-time loop or test mode's step(). */
  private tickOnce(): void {
    this.previousPositions = snapshotPositions(this.sim.state.enemies);
    this.sim.tick(TICK_MS);
  }

  override update(_time: number, deltaMs: number): void {
    // Age tracers before ticking, so one fired this frame is drawn fully opaque.
    this.tracers.advance(deltaMs);
    this.floatingTexts.advance(deltaMs);
    this.loop.advance(frameMs(this.flags, deltaMs));
    this.hud.update();
    this.endScreen.update();
    this.towerPanel.update();

    const { enemies, towers } = this.sim.state;
    this.towerViews.sync(towers);
    this.enemyViews.sync(enemies);
    this.tracerGraphics.clear();
    drawTracers(this.tracerGraphics, this.tracers.active());
    const { selectedId } = this.towerPanel;
    const selected = towers.find((tower) => tower.id === selectedId);
    this.selectedRingKey = this.showRing(this.selectedRing, this.selectedRingKey, selected);
    // Checked every frame, not only on pointer moves, so a tower that appears under a still pointer shows its ring.
    // The selected tower's ring is drawn already.
    const hovered = this.pointerTile && towerAt(towers, this.pointerTile);
    this.hoveredRingKey = this.showRing(
      this.rangeRing,
      this.hoveredRingKey,
      hovered === selected ? undefined : hovered,
    );
    // Every frame too, so the ghost turns green when Money arrives under a still pointer.
    // None while a tower is selected, since a click then only deselects.
    this.showGhost(selected ? undefined : ghostAt(this.sim, PLACING, this.pointerTile));
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

  /** Draws `ghost` on its tile, or hides it when there is none. */
  private showGhost(ghost: Ghost | undefined): void {
    const unchanged =
      ghost?.tile.col === this.ghost?.tile.col &&
      ghost?.tile.row === this.ghost?.tile.row &&
      ghost?.placeable === this.ghost?.placeable;
    if (unchanged) return;
    this.ghost = ghost;
    this.ghostGraphics.clear().setVisible(ghost !== undefined);
    if (!ghost) return;
    const { x, y } = toPixels(tileCenter(ghost.tile));
    drawGhost(this.ghostGraphics.setPosition(x, y), PLACING, ghost.placeable);
  }
}
