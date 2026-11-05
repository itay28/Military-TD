/** What a keyboard shortcut does. */
export const SHORTCUT_ACTIONS = ['build', 'upgrade', 'sell', 'startWave', 'cycleSpeed', 'pause', 'help'] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** One row of the key map: the keys (`KeyboardEvent.key` values) that do `action`, as the help overlay names them. */
export interface KeyBinding {
  readonly action: ShortcutAction;
  readonly keys: readonly string[];
  readonly label: string;
  readonly description: string;
}

/**
 * The one key map: the handlers match keys through `shortcutFor` and the help overlay lists these rows, so the two
 * can't drift. Letters match either case.
 */
export const KEY_MAP: readonly KeyBinding[] = [
  {
    action: 'build',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    label: '1–9',
    description: 'Pick a tower to build',
  },
  { action: 'upgrade', keys: ['u'], label: 'U', description: 'Upgrade the selected tower' },
  { action: 'sell', keys: ['s'], label: 'S', description: 'Sell the selected tower' },
  { action: 'startWave', keys: [' '], label: 'Space', description: 'Start the next wave' },
  { action: 'cycleSpeed', keys: ['f'], label: 'F', description: 'Change the game speed' },
  {
    action: 'pause',
    keys: ['p', 'Escape'],
    label: 'P / Esc',
    description: 'Pause (Esc cancels a selection first)',
  },
  { action: 'help', keys: ['?', 'h'], label: '? / H', description: 'Show these keys' },
];

const ACTION_BY_KEY = new Map(KEY_MAP.flatMap(({ action, keys }) => keys.map((key) => [key.toLowerCase(), action])));

/** Inputs that take typed keys, or arrow and number keys (a range): a shortcut there would steal the player's typing. */
const TYPING_INPUTS = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url', 'range']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target as Node).nodeType) return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  switch (el.tagName) {
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    case 'INPUT':
      return TYPING_INPUTS.has((el as HTMLInputElement).type);
    default:
      return false;
  }
}

/**
 * The shortcut a keydown asks for, or undefined: for an unbound key, with Ctrl, Alt or Meta held (Shift is fine, it
 * types `?`), or while focus is in a text field or range input.
 */
export function shortcutFor(event: KeyboardEvent): ShortcutAction | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey || isTypingTarget(event.target)) return undefined;
  return ACTION_BY_KEY.get(event.key.toLowerCase());
}
