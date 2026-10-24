import Phaser from 'phaser';
import { MVP_MAP } from '../data/maps';
import { START_LIVES, START_MONEY } from '../data/start';
import { MVP_WAVES } from '../data/waves';
import { createGame, TICK_MS, type Game } from '../sim/game';
import { mountHud, type Hud } from '../ui/hud';
import { drawMap } from './drawMap';
import { createFixedStep, type FixedStep } from './fixedStep';

/** Real time keeps up down to about 12 fps; below that the game runs slower instead of spiralling. */
const MAX_TICKS_PER_FRAME = 5;

export interface GameSceneOptions {
  /** The DOM element the HUD is drawn in (`#hud` in index.html). */
  readonly hudRoot: HTMLElement;
}

/** Owns the Simulation, draws it, and advances it on a fixed timestep. */
export class GameScene extends Phaser.Scene {
  private readonly hudRoot: HTMLElement;
  private sim!: Game;
  private loop!: FixedStep;
  private hud!: Hud;

  constructor({ hudRoot }: GameSceneOptions) {
    super('Game');
    this.hudRoot = hudRoot;
  }

  create(): void {
    this.sim = createGame({ map: MVP_MAP, lives: START_LIVES, money: START_MONEY, waves: MVP_WAVES });
    drawMap(this.add.graphics(), this.sim.state.map);
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      maxStepsPerFrame: MAX_TICKS_PER_FRAME,
      step: (dtMs) => this.sim.tick(dtMs),
    });
    this.hud = mountHud(this.hudRoot, this.sim);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
  }

  override update(_time: number, deltaMs: number): void {
    this.loop.advance(deltaMs);
    this.hud.update();
  }
}
