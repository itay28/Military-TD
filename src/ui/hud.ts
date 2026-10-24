import { WAVE_BANNER_MS } from '../data/display';
import type { Game } from '../sim/game';

/** The parts of the Game the HUD reads and commands. */
export type HudGame = Pick<Game, 'state' | 'events' | 'startWave'>;

export interface Hud {
  /** Redraws from `game.state`; call once per frame. Writes only values that changed. */
  update(): void;
  /** Removes the HUD's elements and unsubscribes from game events. */
  destroy(): void;
}

/** Builds the HUD (DOM overlay, ADR-0003) inside `root` and shows `game` in it. */
export function mountHud(root: HTMLElement, game: HudGame): Hud {
  const doc = root.ownerDocument;
  const field = (testId: string) => {
    const el = doc.createElement('span');
    el.dataset.testid = testId;
    root.append(el);
    return el;
  };
  const money = field('hud-money');
  const lives = field('hud-lives');
  const wave = field('hud-wave');
  const startWave = doc.createElement('button');
  startWave.type = 'button';
  startWave.dataset.testid = 'start-wave';
  startWave.textContent = 'Start Wave';
  root.append(startWave);
  const banner = doc.createElement('div');
  banner.setAttribute('role', 'status');
  banner.dataset.testid = 'wave-banner';
  banner.hidden = true;
  root.append(banner);
  /** Sim time when the banner goes away; it shows until then. */
  let bannerUntilMs = 0;

  // Runs every frame, so it touches the DOM only when a value changed.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };

  const update = () => {
    const { state } = game;
    setText(money, `Money ${state.money}`);
    setText(lives, `Lives ${state.lives}`);
    setText(wave, `Wave ${state.waveNumber} / ${state.totalWaves}`);
    const canStart = state.phase === 'build';
    if (startWave.disabled === canStart) startWave.disabled = !canStart;
    // Ticks stop once the game is over, so the banner would never time out: take it down then.
    const showBanner = state.timeMs < bannerUntilMs && (state.phase === 'build' || state.phase === 'wave');
    if (banner.hidden === showBanner) banner.hidden = !showBanner;
  };
  const offWaveCleared = game.events.on('waveCleared', ({ waveNumber }) => {
    setText(banner, `Wave ${waveNumber} cleared`);
    bannerUntilMs = game.state.timeMs + WAVE_BANNER_MS;
  });
  // The sim decides; a refused start changes nothing. Redraw at once so a second click can't land first.
  startWave.addEventListener('click', () => {
    game.startWave();
    update();
  });
  update();
  return {
    update,
    destroy() {
      offWaveCleared();
      root.replaceChildren();
    },
  };
}
