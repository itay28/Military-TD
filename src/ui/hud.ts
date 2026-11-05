import { WAVE_BANNER_MS } from '../data/display';
import { mountSpeedButtons, type GameSpeedControl } from '../scenes/gameSpeed';
import { isGameOver, type Game } from '../sim/game';
import { waveDps } from '../sim/stats';
import { mountDpsMeter, type DpsMeterOptions } from './dpsMeter';

/** The parts of the Game the HUD reads and commands. */
export type HudGame = Pick<Game, 'state' | 'events' | 'callNextWave'>;

/** The player's game speed, which the scene owns: the HUD shows it and sets the one clicked. */
export type HudSpeed = GameSpeedControl;

export interface Hud {
  /** The group holding the HUD's buttons; the pause menu adds its Pause button here. */
  readonly controls: HTMLElement;
  /** What a click on Start Wave does (the Space key): nothing while it is disabled. */
  startWave(): void;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the HUD's elements, and unsubscribes from game events. */
  destroy(): void;
}

/** Builds the HUD inside `root` and shows `game` in it. It's DOM, not Phaser text, so tests can query it (ADR-0003). */
export function mountHud(root: HTMLElement, game: HudGame, speed: HudSpeed, dpsMeter: DpsMeterOptions = {}): Hud {
  const doc = root.ownerDocument;
  // Three fixed groups, so a text that appears or grows never moves a button (#274): the stats, a message slot that
  // takes the leftover space and clips, and the controls.
  const group = (className: string) => {
    const el = doc.createElement('div');
    el.className = className;
    root.append(el);
    return el;
  };
  const stats = group('hud-stats');
  const message = group('hud-message');
  const controls = group('hud-controls');
  const field = (testId: string, parent: HTMLElement) => {
    const el = doc.createElement('span');
    el.dataset.testid = testId;
    parent.append(el);
    return el;
  };
  const money = field('hud-money', stats);
  const lives = field('hud-lives', stats);
  const wave = field('hud-wave', stats);
  // The DPS figure opens and closes the DPS meter, a panel under the HUD (#243).
  const dps = doc.createElement('button');
  dps.type = 'button';
  dps.dataset.testid = 'hud-dps';
  dps.className = 'hud-dps';
  dps.setAttribute('aria-controls', 'dps-meter');
  dps.setAttribute('aria-expanded', 'false');
  stats.append(dps);
  const { tacticalMode } = game.state;
  // Timed mode (ADR-0011): waves come on their timers and this calls the next one in early. Tactical: it starts each.
  const callNextWave = doc.createElement('button');
  callNextWave.type = 'button';
  callNextWave.dataset.testid = 'start-wave';
  callNextWave.textContent = tacticalMode ? 'Start Wave' : 'Call next wave';
  controls.append(callNextWave);
  const nextWave = field('hud-next-wave', message);
  const speedButtons = mountSpeedButtons(
    controls,
    speed,
    (n) => `game-speed-${n}`,
    'game-speed',
    () => update(),
  );
  // A live region stays in place and only its text changes, so screen readers announce it.
  const banner = doc.createElement('div');
  banner.setAttribute('role', 'status');
  banner.className = 'hud-banner';
  banner.dataset.testid = 'wave-banner';
  message.append(banner);
  const meter = mountDpsMeter(root, game, dpsMeter);
  dps.addEventListener('click', () => {
    meter.toggle();
    dps.setAttribute('aria-expanded', String(meter.open));
  });
  let bannerText = '';
  /** Sim time when the banner goes away; it shows until then. */
  let bannerUntilMs = 0;

  // Runs every frame, so it touches the DOM only when a value changed.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const setDisabled = (el: HTMLButtonElement, disabled: boolean) => {
    if (el.disabled !== disabled) el.disabled = disabled;
  };

  const update = () => {
    const { state } = game;
    setText(money, `Money ${state.money}`);
    setText(lives, `Lives ${state.lives}`);
    const { activeWaves } = state;
    const overlap = activeWaves.length > 1;
    setText(
      wave,
      overlap
        ? `Waves ${activeWaves[0]}–${activeWaves.at(-1)} / ${state.totalWaves}`
        : `Wave ${state.waveNumber} / ${state.totalWaves}`,
    );
    const { damage, elapsedMs } = state.stats.wave;
    // The wave figures freeze when the wave ends, so between waves this keeps showing the last wave's DPS.
    setText(dps, state.waveNumber === 0 ? 'DPS –' : `DPS ${Math.round(waveDps(damage, elapsedMs))}`);
    const wavesLeft = state.waveNumber < state.totalWaves && !isGameOver(state.phase);
    setDisabled(callNextWave, !wavesLeft || (tacticalMode && state.phase !== 'build'));
    // Ticks stop once the game is over, so a faster speed would change nothing.
    speedButtons.sync(isGameOver(state.phase));
    // Ticks stop once the game is over, so the banner would never time out: take it down then.
    const showBanner = state.timeMs < bannerUntilMs && !isGameOver(state.phase);
    setText(banner, showBanner ? bannerText : '');
    // In timed mode the countdown is always up while a wave is due, during a wave too. Short, so it fits the message
    // slot at 900 px beside an overlap counter; the "cleared" banner follows it there when there's room.
    const { nextWaveAtMs } = state;
    setText(nextWave, nextWaveAtMs === undefined ? '' : `Next ${Math.ceil((nextWaveAtMs - state.timeMs) / 1000)}s`);
    meter.update();
  };
  const offWaveCleared = game.events.on('waveCleared', ({ waveNumber }) => {
    bannerText = `Wave ${waveNumber} cleared`;
    bannerUntilMs = game.state.timeMs + WAVE_BANNER_MS;
  });
  // The sim decides; a refused start changes nothing. Redraw at once so a second click can't land first.
  const onStartWave = () => {
    if (callNextWave.disabled) return;
    game.callNextWave();
    update();
  };
  callNextWave.addEventListener('click', onStartWave);
  update();
  return {
    controls,
    startWave: onStartWave,
    update,
    destroy() {
      offWaveCleared();
      root.replaceChildren();
    },
  };
}
