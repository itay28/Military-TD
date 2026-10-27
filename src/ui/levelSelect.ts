import type { MapEntry } from '../data/maps';
import { createMap } from '../sim/map';
import { drawMapPreview } from './mapPreview';

export interface LevelSelectOptions {
  /** The page's `#app`: marked `data-screen="level-select"` while this shows, which hides the game's UI. */
  readonly app: HTMLElement;
  /** The maps to offer, in order. */
  readonly maps: readonly MapEntry[];
  /** Called with a map's id when the player picks it. */
  readonly onPick: (id: string) => void;
  /** Called when the player presses Back. */
  readonly onBack: () => void;
}

export interface LevelSelect {
  /** Removes the screen's elements, hides it and shows the game's UI again; its buttons do nothing after this. */
  destroy(): void;
}

/** Builds the Level select inside `root`: one button per map, with its preview and name, then Back. DOM (ADR-0003). */
export function mountLevelSelect(root: HTMLElement, { app, maps, onPick, onBack }: LevelSelectOptions): LevelSelect {
  const doc = root.ownerDocument;
  let live = true;
  const title = doc.createElement('h1');
  title.textContent = 'Select map';
  const list = doc.createElement('ul');
  const mapButtons = maps.map(({ id, name, data }) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'map';
    const preview = doc.createElement('canvas');
    // The name alone is the button's accessible name; the picture is for sighted players.
    preview.setAttribute('aria-hidden', 'true');
    drawMapPreview(preview, createMap(data));
    const label = doc.createElement('span');
    label.textContent = name;
    button.append(preview, label);
    button.addEventListener('click', () => live && onPick(id));
    const item = doc.createElement('li');
    item.append(button);
    list.append(item);
    return button;
  });
  const back = doc.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  back.addEventListener('click', () => live && onBack());
  root.append(title, list, back);
  root.hidden = false;
  app.dataset.screen = 'level-select';
  mapButtons[0]?.focus();
  return {
    destroy() {
      live = false;
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
