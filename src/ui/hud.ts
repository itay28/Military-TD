import { TERMS, WAVE_BANNER_MS, contactBanner, formatFunds, hqLevel } from '../data/display';
import { mountSpeedButtons, type GameSpeedControl } from '../scenes/gameSpeed';
import { isGameOver, type Game } from '../sim/game';
import { waveDps } from '../sim/stats';

/** The parts of the Game the HUD reads and commands. */
export type HudGame = Pick<Game, 'state' | 'events' | 'startWave' | 'setAutoStart'>;

/** The player's game speed, which the scene owns: the HUD shows it and sets the one clicked. */
export type HudSpeed = GameSpeedControl;

export interface Hud {
  /** The group holding the HUD's buttons; the pause menu adds its Pause button here. */
  readonly controls: HTMLElement;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the HUD's elements and unsubscribes from game events. */
  destroy(): void;
}

/** Builds the HUD inside `root` and shows `game` in it. It's DOM, not Phaser text, so tests can query it (ADR-0003). */
export function mountHud(root: HTMLElement, game: HudGame, speed: HudSpeed): Hud {
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
  // The HQ: a meter, so a screen reader hears "HQ 14 of 20"; the label, bar and digits inside are for the eye.
  const maxLives = game.state.lives;
  const lives = field('hud-lives', stats);
  lives.className = 'hq';
  lives.setAttribute('role', 'meter');
  lives.setAttribute('aria-label', TERMS.lives);
  lives.setAttribute('aria-valuemin', '0');
  lives.setAttribute('aria-valuemax', String(maxLives));
  const hqLabel = doc.createElement('span');
  hqLabel.className = 'hq-label';
  hqLabel.textContent = TERMS.lives;
  const hqBar = doc.createElement('span');
  hqBar.className = 'hq-bar';
  const hqFill = doc.createElement('span');
  hqFill.className = 'hq-fill';
  hqBar.append(hqFill);
  const hqCount = doc.createElement('span');
  hqCount.className = 'hq-count';
  lives.append(hqLabel, hqBar, hqCount);
  const wave = field('hud-wave', stats);
  const dps = field('hud-dps', stats);
  const startWave = doc.createElement('button');
  startWave.type = 'button';
  startWave.dataset.testid = 'start-wave';
  startWave.textContent = TERMS.startWave;
  controls.append(startWave);
  // A toggle button: aria-pressed says whether it's on. Not "Auto-start waves": that name would also match "Start Wave".
  const autoStart = doc.createElement('button');
  autoStart.type = 'button';
  autoStart.dataset.testid = 'auto-start';
  autoStart.className = 'hud-toggle';
  autoStart.textContent = 'Auto-start';
  controls.append(autoStart);
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
    setText(money, `${TERMS.money} ${formatFunds(state.money)}`);
    if (hqCount.textContent !== `${state.lives}/${maxLives}`) {
      hqCount.textContent = `${state.lives}/${maxLives}`;
      lives.setAttribute('aria-valuenow', String(state.lives));
      lives.setAttribute('aria-valuetext', `${TERMS.lives} ${state.lives} of ${maxLives}`);
      lives.dataset.level = hqLevel(state.lives, maxLives);
      hqFill.style.width = `${maxLives > 0 ? (100 * state.lives) / maxLives : 0}%`;
    }
    setText(wave, `Wave ${state.waveNumber} / ${state.totalWaves}`);
    const { damage, elapsedMs } = state.stats.wave;
    // The wave figures freeze when the wave ends, so between waves this keeps showing the last wave's DPS.
    setText(dps, state.waveNumber === 0 ? 'DPS –' : `DPS ${Math.round(waveDps(damage, elapsedMs))}`);
    setDisabled(startWave, state.phase !== 'build');
    const pressed = String(state.autoStart);
    if (autoStart.getAttribute('aria-pressed') !== pressed) autoStart.setAttribute('aria-pressed', pressed);
    setDisabled(autoStart, isGameOver(state.phase));
    // Ticks stop once the game is over, so a faster speed would change nothing.
    speedButtons.sync(isGameOver(state.phase));
    // Ticks stop once the game is over, so the banner would never time out: take it down then.
    const bannerUp = state.timeMs < bannerUntilMs && !isGameOver(state.phase);
    setText(banner, bannerUp ? bannerText : '');
    // The countdown waits for the banner to go, so the HUD isn't too wide for one line.
    const { autoStartAtMs } = state;
    const counting = autoStartAtMs !== undefined && !bannerUp;
    setText(nextWave, counting ? `Next wave in ${Math.ceil((autoStartAtMs - state.timeMs) / 1000)}` : '');
  };
  const showBanner = (text: string) => {
    bannerText = text;
    bannerUntilMs = game.state.timeMs + WAVE_BANNER_MS;
  };
  const offWaveStarted = game.events.on('waveStarted', ({ waveNumber }) => showBanner(contactBanner(waveNumber)));
  const offWaveCleared = game.events.on('waveCleared', ({ waveNumber }) => showBanner(`Wave ${waveNumber} cleared`));
  // The sim decides; a refused start changes nothing. Redraw at once so a second click can't land first.
  startWave.addEventListener('click', () => {
    game.startWave();
    update();
  });
  autoStart.addEventListener('click', () => {
    game.setAutoStart(!game.state.autoStart);
    update();
  });
  update();
  return {
    controls,
    update,
    destroy() {
      offWaveStarted();
      offWaveCleared();
      root.replaceChildren();
    },
  };
}
