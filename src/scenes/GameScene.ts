import Phaser from 'phaser';
import { TRACER } from '../data/display';
import { MVP_MAP } from '../data/maps';
import { START_LIVES, START_MONEY } from '../data/start';
import { MVP_WAVES } from '../data/waves';
import type { Enemy } from '../sim/enemies';
import { createGame, TICK_MS, type Game } from '../sim/game';
import { tileCenter, type Position, type Tile } from '../sim/map';
import { towerAt, type Tower } from '../sim/towers';
import { pixelToTile, toPixels, type Pixel } from './coords';
import { drawEnemy, drawRangeRing, drawTower, drawTracers } from './drawEntities';
import { drawMap } from './drawMap';
import { createFixedStep, type FixedStep } from './fixedStep';
import { interpolatePosition, snapshotPositions } from './interpolate';
import { createTracers, type Tracers } from './tracers';
import { mountEndScreen, type EndScreen } from '../ui/endScreen';
import { mountHud, type Hud } from '../ui/hud';
import { createViewSync, type ViewSync } from './viewSync';

/** Real time keeps up down to about 12 fps; below that the game runs slower instead of spiralling. */
const MAX_TICKS_PER_FRAME = 5;

const towerCenter = (tower: Tower): Pixel => toPixels(tileCenter(tower.tile));

/** Draw order, back to front. */
const DEPTH = { map: 0, towers: 1, enemies: 2, tracers: 3, rangeRing: 4 } as const;

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
}

/** Owns the Simulation, draws it, and advances it on a fixed timestep. */
export class GameScene extends Phaser.Scene {
  private readonly hudRoot: HTMLElement;
  private readonly endScreenRoot: HTMLElement;
  private sim!: Game;
  private loop!: FixedStep;
  private hud!: Hud;
  private endScreen!: EndScreen;
  private enemyViews!: ViewSync<Enemy>;
  private towerViews!: ViewSync<Tower>;
  private tracers!: Tracers;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private rangeRing!: Phaser.GameObjects.Graphics;
  /** Enemy positions before the latest tick, to interpolate from. */
  private previousPositions!: ReadonlyMap<number, Position>;
  /** The tile under the pointer, or undefined when it is off the canvas. */
  private pointerTile: Tile | undefined;
  /** The tower whose range ring is drawn, by id. */
  private hoveredTowerId: number | undefined;

  constructor({ hudRoot, endScreenRoot }: GameSceneOptions) {
    super('Game');
    this.hudRoot = hudRoot;
    this.endScreenRoot = endScreenRoot;
  }

  create(): void {
    // Restart reruns create() on this same object. Sim ids start again at 1, so last game's ids must not linger here.
    this.previousPositions = new Map();
    this.pointerTile = undefined;
    this.hoveredTowerId = undefined;
    this.sim = createGame({ map: MVP_MAP, lives: START_LIVES, money: START_MONEY, waves: MVP_WAVES });
    drawMap(this.add.graphics().setDepth(DEPTH.map), this.sim.state.map);
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      maxStepsPerFrame: MAX_TICKS_PER_FRAME,
      step: (dtMs) => {
        this.previousPositions = snapshotPositions(this.sim.state.enemies);
        this.sim.tick(dtMs);
      },
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
        const graphics = this.add.graphics().setDepth(DEPTH.towers).setPosition(x, y);
        drawTower(graphics, tower);
        return graphics;
      },
      destroy: (graphics) => graphics.destroy(),
    });

    this.tracers = createTracers(TRACER.fadeMs);
    this.tracerGraphics = this.add.graphics().setDepth(DEPTH.tracers);
    this.sim.events.on('towerFired', (shot) => {
      const tower = this.sim.state.towers.find((t) => t.id === shot.towerId);
      if (tower) this.tracers.add(towerCenter(tower), toPixels(shot.position));
    });

    this.rangeRing = this.add.graphics().setDepth(DEPTH.rangeRing).setVisible(false);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointerTile = pixelToTile({ x: pointer.worldX, y: pointer.worldY });
    });
    this.input.on('gameout', () => (this.pointerTile = undefined));

    this.hud = mountHud(this.hudRoot, this.sim);
    // Restart: Phaser destroys the scene's display objects and input listeners, then create() builds a fresh sim.
    this.endScreen = mountEndScreen(this.endScreenRoot, this.sim, { onRestart: () => this.scene.restart() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      this.endScreen.destroy();
    });
  }

  override update(_time: number, deltaMs: number): void {
    // Age tracers before ticking, so one fired this frame is drawn fully opaque.
    this.tracers.advance(deltaMs);
    this.loop.advance(deltaMs);
    this.hud.update();
    this.endScreen.update();

    const { enemies, towers } = this.sim.state;
    this.towerViews.sync(towers);
    this.enemyViews.sync(enemies);
    this.tracerGraphics.clear();
    drawTracers(this.tracerGraphics, this.tracers.active());
    // Checked every frame, not only on pointer moves, so a tower that appears under a still pointer shows its ring.
    this.hover(this.pointerTile && towerAt(towers, this.pointerTile));
  }

  /** Shows the range ring of `tower`, or hides it when the pointer isn't over one. */
  private hover(tower: Tower | undefined): void {
    if (tower?.id === this.hoveredTowerId) return;
    this.hoveredTowerId = tower?.id;
    this.rangeRing.clear().setVisible(tower !== undefined);
    if (!tower) return;
    const { x, y } = towerCenter(tower);
    drawRangeRing(this.rangeRing.setPosition(x, y), tower);
  }
}
