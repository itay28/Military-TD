import Phaser from 'phaser';
import { MVP_MAP } from '../data/maps';
import { START_LIVES } from '../data/start';
import { MVP_WAVES } from '../data/waves';
import { createGame, TICK_MS, type Game } from '../sim/game';
import { drawMap } from './drawMap';
import { createFixedStep, type FixedStep } from './fixedStep';

/** Real time keeps up down to about 12 fps; below that the game runs slower instead of spiralling. */
const MAX_TICKS_PER_FRAME = 5;

/** Owns the Simulation, draws it, and advances it on a fixed timestep. */
export class GameScene extends Phaser.Scene {
  private sim!: Game;
  private loop!: FixedStep;

  constructor() {
    super('Game');
  }

  create(): void {
    this.sim = createGame({ map: MVP_MAP, lives: START_LIVES, waves: MVP_WAVES });
    drawMap(this.add.graphics(), this.sim.state.map);
    this.loop = createFixedStep({
      stepMs: TICK_MS,
      maxStepsPerFrame: MAX_TICKS_PER_FRAME,
      step: (dtMs) => this.sim.tick(dtMs),
    });
  }

  override update(_time: number, deltaMs: number): void {
    this.loop.advance(deltaMs);
  }
}
