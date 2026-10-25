import type { Game } from '../sim/game';

/** The parts of the Game the End screen reads. */
export type EndScreenGame = Pick<Game, 'state'>;

export interface EndScreenOptions {
  /** Called when the player presses Restart. */
  readonly onRestart: () => void;
}

export interface EndScreen {
  /** Shows the overlay once the game is over; call once per frame. Writes only when it opens. */
  update(): void;
  /** Removes the overlay's elements and hides it. */
  destroy(): void;
}

const TITLE_ID = 'end-screen-title';

/** Builds the End screen inside `root`, an overlay over the canvas. It's DOM, so tests can query it (ADR-0003). */
export function mountEndScreen(root: HTMLElement, game: EndScreenGame, { onRestart }: EndScreenOptions): EndScreen {
  const doc = root.ownerDocument;
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  const wavesSurvived = doc.createElement('p');
  wavesSurvived.dataset.testid = 'waves-survived';
  const restart = doc.createElement('button');
  restart.type = 'button';
  restart.dataset.testid = 'restart';
  restart.textContent = 'Restart';
  restart.addEventListener('click', () => onRestart());
  dialog.append(heading, wavesSurvived, restart);
  root.append(dialog);
  root.hidden = true;

  // The result can't change once the game is over (ticks stop), so it is written once, when the overlay opens.
  const update = () => {
    const { phase, wavesCleared, totalWaves } = game.state;
    if (!root.hidden || (phase !== 'victory' && phase !== 'defeat')) return;
    heading.textContent = phase === 'victory' ? 'Victory' : 'Defeat';
    wavesSurvived.textContent = `Waves survived ${wavesCleared} / ${totalWaves}`;
    root.hidden = false;
    restart.focus();
  };
  update();
  return {
    update,
    destroy() {
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
