import { DIFFICULTY } from '../data/difficulty';
import {
  ENEMY_NAMES,
  ENEMY_STYLE,
  ENEMY_WEAKNESS,
  TERMS,
  WAVE_BANNER_MS,
  contactBanner,
  formatFunds,
  hqLevel,
} from '../data/display';
import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { mountSpeedButtons, type GameSpeedControl } from '../scenes/gameSpeed';
import { leadBoss } from '../sim/enemies';
import { isGameOver, type Game, type GameState } from '../sim/game';
import { intelDepth, waveIntel, type WaveIntel } from '../sim/intel';
import { waveDps } from '../sim/stats';
import type { WaveData } from '../sim/waves';
import { mountDpsMeter, type DpsMeterOptions } from './dpsMeter';
import { renderIconLayers, type RenderIcon } from './renderIcon';

/** The parts of the Game the HUD reads and commands. */
export type HudGame = Pick<Game, 'state' | 'events' | 'callNextWave' | 'waves'>;

/** The player's game speed, which the scene owns: the HUD shows it and sets the one clicked. */
export type HudSpeed = GameSpeedControl;

/** The HUD's options: the DPS meter's, plus the icons Sniper intel (#353) shows. */
export interface HudOptions extends DpsMeterOptions {
  /** The render a kind is drawn with on this map (#567), or null when it has none loaded: then a shape stands in. */
  readonly iconFor?: (kind: EnemyKind) => RenderIcon | null;
}

/** The intel strip's text with no Sniper on the field (#353), shown once per game. */
export const INTEL_HINT = 'Build a Sniper for intel';

/** What Sniper intel shows now; see `intelView`. */
export interface IntelView {
  /** A wave is due: the strip may show. */
  readonly due: boolean;
  /** The number of the next wave to start, counting from 1. */
  readonly nextWave: number;
  /** The coming waves the Snipers report: none without one. */
  readonly waves: readonly WaveIntel[];
}

/**
 * What Sniper intel shows now (#353): the coming waves the player's Snipers report, while a wave is due. In timed mode
 * that's whenever the countdown runs, during a wave too; in Tactical mode only in the build phase. `due` is false once
 * the last wave has started or the game is over.
 */
export function intelView(
  state: Pick<GameState, 'towers' | 'waveNumber' | 'totalWaves' | 'phase' | 'tacticalMode' | 'nextWaveAtMs'>,
  waves: readonly WaveData[],
): IntelView {
  const due =
    !isGameOver(state.phase) &&
    state.waveNumber < Math.min(state.totalWaves, waves.length) &&
    (state.tacticalMode ? state.phase === 'build' : state.nextWaveAtMs !== undefined);
  const nextWave = state.waveNumber + 1;
  return { due, nextWave, waves: due ? waveIntel(waves, state.waveNumber, intelDepth(state.towers)) : [] };
}

/** The intel icon's square, in CSS pixels. */
const INTEL_ICON_PX = 20;

export interface Hud {
  /** The group holding the HUD's buttons; the pause menu adds its Pause button here. */
  readonly controls: HTMLElement;
  /** What a click on Start Wave does (the Space key): nothing while it is disabled. */
  startWave(): void;
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** What the Sniper intel strip shows (#353): the waves it reports, and whether the "Build a Sniper" hint is up. */
  readonly intel: { readonly waves: readonly WaveIntel[]; readonly hint: boolean };
  /** Removes the HUD's elements, and unsubscribes from game events. */
  destroy(): void;
}

/** Builds the HUD inside `root` and shows `game` in it. It's DOM, not Phaser text, so tests can query it (ADR-0003). */
export function mountHud(root: HTMLElement, game: HudGame, speed: HudSpeed, options: HudOptions = {}): Hud {
  const { iconFor = () => null, ...dpsMeter } = options;
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
  // Only Hard is tagged (#465), but the slot is always there at a fixed width, so the row is the same on both (#569).
  field('hud-difficulty', stats).textContent =
    game.state.difficulty === 'normal' ? '' : DIFFICULTY[game.state.difficulty].label;
  // The DPS figure opens and closes the DPS meter, a panel under the HUD (#243).
  const dps = doc.createElement('button');
  dps.type = 'button';
  dps.dataset.testid = 'hud-dps';
  dps.className = 'hud-dps';
  dps.setAttribute('aria-controls', 'dps-meter');
  dps.setAttribute('aria-expanded', 'false');
  stats.append(dps);
  // The countdown has a stats slot of its own, wide enough for "Next 100s", so it's never clipped (#569).
  const nextWave = field('hud-next-wave', stats);
  const { tacticalMode } = game.state;
  // Timed mode (ADR-0011): waves come on their timers and this calls the next one in early. Tactical: it starts each.
  const callNextWave = doc.createElement('button');
  callNextWave.type = 'button';
  callNextWave.dataset.testid = 'start-wave';
  callNextWave.textContent = tacticalMode ? TERMS.startWave : TERMS.callNextWave;
  controls.append(callNextWave);
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
  const intel = mountIntel(root, iconFor);
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
    intel.update(intelView(state, game.waves));
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
    get intel() {
      return intel.shown;
    },
    destroy() {
      offWaveStarted();
      offWaveCleared();
      root.replaceChildren();
    },
  };
}

/**
 * The Sniper intel strip (#353): hangs under the HUD like the boss bar, so it never moves a button. One row per
 * reported wave, each kind a chip with its icon, count and name; hovering, focusing or tapping a chip shows its
 * weakness line and armor. With no Sniper it hints at building one, once per game: until that wave starts, or a
 * Sniper is built.
 */
function mountIntel(root: HTMLElement, iconFor: (kind: EnemyKind) => RenderIcon | null) {
  const doc = root.ownerDocument;
  const strip = doc.createElement('div');
  strip.dataset.testid = 'hud-intel';
  strip.className = 'hud-intel';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Sniper intel');
  strip.hidden = true;
  const rows = doc.createElement('div');
  rows.className = 'intel-waves';
  const tip = doc.createElement('p');
  tip.id = 'hud-intel-tip';
  tip.dataset.testid = 'intel-tip';
  tip.className = 'intel-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const hint = doc.createElement('p');
  hint.dataset.testid = 'intel-hint';
  hint.className = 'intel-hint';
  hint.textContent = INTEL_HINT;
  hint.hidden = true;
  strip.append(rows, hint, tip);
  root.append(strip);

  /** The hint: not yet shown, up for the wave number it was first shown before, or over for this game. */
  let hintFor: number | 'pending' | 'done' = 'pending';
  let shown: Hud['intel'] = { waves: [], hint: false };
  /** The waves drawn, as a key, so the chips are rebuilt only when what they say changes. */
  let drawnKey = '';
  /** The chip whose tip a tap pinned open. */
  let tapped: HTMLElement | undefined;

  const showTip = (chip: HTMLElement | undefined) => {
    const kind = chip?.dataset.kind as EnemyKind | undefined;
    tip.hidden = !kind;
    if (kind) tip.textContent = `${ENEMY_WEAKNESS[kind]} Armor ${ENEMY_STATS[kind].armor}.`;
  };
  const chipFor = (kind: EnemyKind, count: number) => {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.dataset.testid = 'intel-kind';
    chip.dataset.kind = kind;
    chip.className = 'intel-kind';
    chip.setAttribute('aria-describedby', tip.id);
    const icon = doc.createElement('span');
    icon.className = 'intel-icon';
    icon.setAttribute('aria-hidden', 'true');
    const render = iconFor(kind);
    if (render) icon.append(...renderIconLayers(doc, render, INTEL_ICON_PX));
    else {
      const { shape, color } = ENEMY_STYLE[kind];
      const fallback = doc.createElement('span');
      fallback.className = `intel-shape ${shape}`;
      fallback.style.background = `#${color.toString(16).padStart(6, '0')}`;
      icon.append(fallback);
    }
    const countEl = doc.createElement('span');
    countEl.className = 'intel-count';
    countEl.textContent = String(count);
    const name = doc.createElement('span');
    name.className = 'intel-name';
    name.textContent = ENEMY_NAMES[kind];
    chip.append(icon, countEl, ' ', name);
    chip.addEventListener('mouseenter', () => showTip(chip));
    chip.addEventListener('mouseleave', () => showTip(tapped));
    chip.addEventListener('focus', () => showTip(chip));
    chip.addEventListener('blur', () => showTip(tapped));
    chip.addEventListener('click', () => {
      tapped = tapped === chip ? undefined : chip;
      showTip(tapped);
    });
    return chip;
  };
  const draw = (waves: readonly WaveIntel[]) => {
    tapped = undefined;
    showTip(undefined);
    rows.replaceChildren(
      ...waves.map(({ waveNumber, composition }) => {
        const row = doc.createElement('div');
        row.dataset.testid = 'intel-wave';
        row.dataset.wave = String(waveNumber);
        row.className = 'intel-wave';
        const label = doc.createElement('span');
        label.className = 'intel-label';
        label.textContent = `Wave ${waveNumber}`;
        row.append(label, ...composition.map(({ kind, count }) => chipFor(kind, count)));
        return row;
      }),
    );
  };

  return {
    get shown() {
      return shown;
    },
    update({ due, nextWave, waves }: IntelView) {
      if (waves.length > 0 || (typeof hintFor === 'number' && hintFor !== nextWave)) hintFor = 'done';
      else if (due && hintFor === 'pending') hintFor = nextWave;
      const showHint = due && hintFor === nextWave;
      const key = JSON.stringify(waves);
      if (key !== drawnKey) {
        drawnKey = key;
        draw(waves);
      }
      if (hint.hidden !== !showHint) hint.hidden = !showHint;
      const hidden = waves.length === 0 && !showHint;
      if (strip.hidden !== hidden) strip.hidden = hidden;
      shown = { waves, hint: showHint };
    },
  };
}
