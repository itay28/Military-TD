import { isGameOver, type GameState } from '../sim/game';
import { shortcutFor, type ShortcutAction } from './keymap';

/** What the game's shortcut keys do: each is the same call its button's click makes. */
export interface ShortcutHandlers {
  readonly upgrade: () => void;
  readonly sell: () => void;
  readonly startWave: () => void;
  readonly cycleSpeed: () => void;
  readonly openHelp: () => void;
}

/** The parts of the Game the shortcuts read. */
export interface ShortcutsGame {
  readonly state: Pick<GameState, 'phase'>;
}

/** The actions handled here; `build` is the build bar's and `pause` the pause menu's. */
const HANDLER: Partial<Record<ShortcutAction, keyof ShortcutHandlers>> = {
  upgrade: 'upgrade',
  sell: 'sell',
  startWave: 'startWave',
  cycleSpeed: 'cycleSpeed',
  help: 'openHelp',
};

/**
 * Listens on `doc` for U, S, Space, F and ?/H (`KEY_MAP`). Does nothing once the game is over (the End screen owns
 * the keyboard then); while paused the pause menu stops keys before they get here.
 */
export function mountShortcuts(doc: Document, game: ShortcutsGame, handlers: ShortcutHandlers): { destroy(): void } {
  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || isGameOver(game.state.phase)) return;
    const action = shortcutFor(event);
    const handler = action && HANDLER[action];
    if (!handler) return;
    // Space would also click a focused button.
    event.preventDefault();
    handlers[handler]();
  };
  doc.addEventListener('keydown', onKey);
  return { destroy: () => doc.removeEventListener('keydown', onKey) };
}
