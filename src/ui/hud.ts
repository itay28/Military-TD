import { ENEMY_NAMES, TERMS, WAVE_BANNER_MS, contactBanner, formatFunds, hqLevel } from '../data/display';
import { mountSpeedButtons, type GameSpeedControl } from '../scenes/gameSpeed';
import { leadBoss } from '../sim/enemies';
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
  callNextWave.textContent = tacticalMode ? TERMS.startWave : 'Call next wave';
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
  // The boss HP bar (#458): hangs under the HUD while a boss is on the field, so it never moves a button.
  const boss = doc.createElement('div');
  boss.dataset.testid = 'hud-boss';
  boss.className = 'hud-boss';
  boss.hidden = true;
  const bossMeter = doc.createElement('div');
  bossMeter.className = 'boss';
  bossMeter.setAttribute('role', 'meter');
  bossMeter.setAttribute('aria-valuemin', '0');
  const bossName = doc.createElement('span');
  bossName.className = 'boss-name';
  const bossBar = doc.createElement('span');
  bossBar.className = 'boss-bar';
  const bossFill = doc.createElement('span');
  bossFill.className = 'boss-fill';
  bossBar.append(bossFill);
  const bossCount = doc.createElement('span');
  bossCount.className = 'boss-count';
  bossMeter.append(bossName, bossBar, bossCount);
  boss.append(bossMeter);
  root.append(boss);
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
    setText(money, `${TERMS.money} ${formatFunds(state.money)}`);
    if (hqCount.textContent !== `${state.lives}/${maxLives}`) {
      hqCount.textContent = `${state.lives}/${maxLives}`;
      lives.setAttribute('aria-valuenow', String(state.lives));
      lives.setAttribute('aria-valuetext', `${TERMS.lives} ${state.lives} of ${maxLives}`);
      lives.dataset.level = hqLevel(state.lives, maxLives);
      hqFill.style.width = `${maxLives > 0 ? (100 * state.lives) / maxLives : 0}%`;
    }
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
    const bannerUp = state.timeMs < bannerUntilMs && !isGameOver(state.phase);
    setText(banner, bannerUp ? bannerText : '');
    // In timed mode the countdown is always up while a wave is due, during a wave too. Short, so it fits the message
    // slot at 900 px beside an overlap counter; the "cleared" banner follows it there when there's room.
    const { nextWaveAtMs } = state;
    setText(nextWave, nextWaveAtMs === undefined ? '' : `Next ${Math.ceil((nextWaveAtMs - state.timeMs) / 1000)}s`);
    updateBoss();
    meter.update();
  };
  const updateBoss = () => {
    const lead = leadBoss(game.state.enemies);
    if (boss.hidden !== !lead) boss.hidden = !lead;
    if (!lead) return;
    const name = ENEMY_NAMES[lead.kind];
    // Rounded up, so a boss still on the field never reads 0 HP.
    const hp = Math.ceil(lead.hp);
    const count = `${hp}/${lead.maxHp}`;
    if (bossName.textContent === name && bossCount.textContent === count) return;
    bossName.textContent = name;
    bossCount.textContent = count;
    bossMeter.setAttribute('aria-label', name);
    bossMeter.setAttribute('aria-valuemax', String(lead.maxHp));
    bossMeter.setAttribute('aria-valuenow', String(hp));
    bossMeter.setAttribute('aria-valuetext', `${name} ${hp} of ${lead.maxHp} HP`);
    bossFill.style.width = `${lead.maxHp > 0 ? (100 * hp) / lead.maxHp : 0}%`;
  };
  const showBanner = (text: string) => {
    bannerText = text;
    bannerUntilMs = game.state.timeMs + WAVE_BANNER_MS;
  };
  const offWaveStarted = game.events.on('waveStarted', ({ waveNumber }) => showBanner(contactBanner(waveNumber)));
  const offWaveCleared = game.events.on('waveCleared', ({ waveNumber }) => showBanner(`Wave ${waveNumber} cleared`));
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
      offWaveStarted();
      offWaveCleared();
      root.replaceChildren();
    },
  };
}
