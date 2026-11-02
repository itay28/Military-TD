/** The player's game speeds. Each multiplies the sim time a real frame feeds the fixed step. */
export const GAME_SPEEDS = [1, 2, 3] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];
export const MAX_GAME_SPEED: GameSpeed = 3;

/** The player's game speed, which the scene owns: the HUD and the pause menu show it and set it. */
export interface GameSpeedControl {
  get(): GameSpeed;
  set(speed: GameSpeed): void;
}

/**
 * A "Game speed" group of one ×n button per speed in `parent`. The current one is `aria-pressed`; a click sets that
 * speed directly. `sync()` redraws and writes only what changed.
 */
export function mountSpeedButtons(
  parent: HTMLElement,
  speed: GameSpeedControl,
  testId: (speed: GameSpeed) => string,
  groupTestId?: string,
  onChange?: () => void,
): { group: HTMLElement; sync(disabled?: boolean): void } {
  const doc = parent.ownerDocument;
  const group = doc.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Game speed');
  group.className = 'speed-group';
  if (groupTestId) group.dataset.testid = groupTestId;
  const buttons = GAME_SPEEDS.map((value) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.testid = testId(value);
    button.textContent = `×${value}`;
    button.addEventListener('click', () => {
      speed.set(value);
      sync();
      onChange?.();
    });
    group.append(button);
    return button;
  });
  const sync = (disabled = false) => {
    const current = speed.get();
    buttons.forEach((button, i) => {
      const pressed = String(GAME_SPEEDS[i] === current);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      if (button.disabled !== disabled) button.disabled = disabled;
    });
  };
  parent.append(group);
  sync();
  return { group, sync };
}
