import { WAVE_BANNER_MS } from '../data/display';
import { nextSpeed, type GameSpeed } from '../scenes/gameSpeed';
import { isGameOver, type Game } from '../sim/game';
import { waveDps } from '../sim/stats';

/** The parts of the Game the HUD reads and commands. */
export type HudGame = Pick<Game, 'state' | 'events' | 'startWave' | 'setAutoStart'>;

/** The player's game speed, which the scene owns: the HUD shows it and sets the next one on click. */
export interface HudSpeed {
  get(): GameSpeed;
  set(speed: GameSpeed): void;
}

export interface Hud {
  /** The HUD's button group, where other modules add their buttons (the Pause button). */
  readonly controls: HTMLElement;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the HUD's elements and unsubscribes from game events. */
  destroy(): void;
}

/** Builds the HUD inside `root` and shows `game` in it. It's DOM, not Phaser text, so tests can query it (ADR-0003). */
export function mountHud(root: HTMLElement, game: HudGame, speed: HudSpeed): Hud {
  const doc = root.ownerDocument;
  // Three groups, laid out by index.html: what changes in the texts and the message never moves the buttons.
  const group = (className: string) => {
    const el = doc.createElement('div');
    el.className = className;
    root.append(el);
    return el;
  };
  const stats = group('hud-stats');
  const message = group('hud-message');
  const controls = group('hud-controls');
  const field = (parent: HTMLElement, testId: string) => {
    const el = doc.createElement('span');
    el.dataset.testid = testId;
    parent.append(el);
    return el;
  };
  const button = (testId: string, text = '') => {
    const el = doc.createElement('button');
    el.type = 'button';
    el.dataset.testid = testId;
    el.textContent = text;
    controls.append(el);
    return el;
  };
  const money = field(stats, 'hud-money');
  const lives = field(stats, 'hud-lives');
  const wave = field(stats, 'hud-wave');
  const dps = field(stats, 'hud-dps');
  // A live region stays in place and only its text changes, so screen readers announce it.
  const banner = doc.createElement('div');
  banner.setAttribute('role', 'status');
  banner.className = 'hud-banner';
  banner.dataset.testid = 'wave-banner';
  message.append(banner);
  const nextWave = field(message, 'hud-next-wave');
  const startWave = button('start-wave', 'Start Wave');
  // A toggle button: aria-pressed says whether it's on. Not "Auto-start waves": that name would also match "Start Wave".
  const autoStart = button('auto-start', 'Auto-start');
  autoStart.className = 'hud-toggle';
  const speedButton = button('game-speed');
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
    setText(wave, `Wave ${state.waveNumber} / ${state.totalWaves}`);
    const { damage, elapsedMs } = state.stats.wave;
    // The wave figures freeze when the wave ends, so between waves this keeps showing the last wave's DPS.
    setText(dps, state.waveNumber === 0 ? 'DPS –' : `DPS ${Math.round(waveDps(damage, elapsedMs))}`);
    setDisabled(startWave, state.phase !== 'build');
    const pressed = String(state.autoStart);
    if (autoStart.getAttribute('aria-pressed') !== pressed) autoStart.setAttribute('aria-pressed', pressed);
    setDisabled(autoStart, isGameOver(state.phase));
    const shown = speed.get();
    setText(speedButton, `×${shown}`);
    if (speedButton.getAttribute('aria-label') !== `Game speed ×${shown}`)
      speedButton.setAttribute('aria-label', `Game speed ×${shown}`);
    // Ticks stop once the game is over, so a faster speed would change nothing.
    setDisabled(speedButton, isGameOver(state.phase));
    // Ticks stop once the game is over, so the banner would never time out: take it down then.
    const showBanner = state.timeMs < bannerUntilMs && !isGameOver(state.phase);
    setText(banner, showBanner ? bannerText : '');
    // The countdown waits for the banner to go: they share the message slot.
    const { autoStartAtMs } = state;
    const counting = autoStartAtMs !== undefined && !showBanner;
    setText(nextWave, counting ? `Next wave in ${Math.ceil((autoStartAtMs - state.timeMs) / 1000)}` : '');
  };
  const offWaveCleared = game.events.on('waveCleared', ({ waveNumber }) => {
    bannerText = `Wave ${waveNumber} cleared`;
    bannerUntilMs = game.state.timeMs + WAVE_BANNER_MS;
  });
  // The sim decides; a refused start changes nothing. Redraw at once so a second click can't land first.
  startWave.addEventListener('click', () => {
    game.startWave();
    update();
  });
  autoStart.addEventListener('click', () => {
    game.setAutoStart(!game.state.autoStart);
    update();
  });
  speedButton.addEventListener('click', () => {
    speed.set(nextSpeed(speed.get()));
    update();
  });
  update();
  return {
    controls,
    update,
    destroy() {
      offWaveCleared();
      root.replaceChildren();
    },
  };
}
