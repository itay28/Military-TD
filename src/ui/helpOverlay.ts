import { KEY_MAP, MAP_KEY_HELP } from './keymap';

export interface HelpOverlay {
  /** What Back does: closes the overlay, then calls `onBack`. */
  back(): void;
  /** Takes the overlay away without calling `onBack`. */
  close(): void;
}

const TITLE_ID = 'help-title';

/**
 * Builds the Keys help overlay inside `root`: a modal dialog with a table of every `KEY_MAP` row, then the map cursor's keys (`MAP_KEY_HELP`), and a Back button.
 * Its opener (the pause menu) handles Esc and calls back().
 */
export function mountHelpOverlay(root: HTMLElement, { onBack }: { readonly onBack: () => void }): HelpOverlay {
  const doc = root.ownerDocument;
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  heading.textContent = 'Keys';

  const table = doc.createElement('table');
  const head = table.createTHead().insertRow();
  for (const text of ['Key', 'Action']) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    head.append(th);
  }
  const body = table.createTBody();
  for (const { label, description } of [...KEY_MAP, ...MAP_KEY_HELP]) {
    const row = body.insertRow();
    const key = doc.createElement('th');
    key.scope = 'row';
    const kbd = doc.createElement('kbd');
    kbd.textContent = label;
    key.append(kbd);
    row.append(key);
    row.insertCell().textContent = description;
  }

  const backButton = doc.createElement('button');
  backButton.type = 'button';
  backButton.dataset.testid = 'help-back';
  backButton.textContent = 'Back';
  dialog.append(heading, table, backButton);
  root.append(dialog);
  root.hidden = false;
  backButton.focus();

  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    root.replaceChildren();
    root.hidden = true;
  };
  const back = () => {
    if (!open) return;
    close();
    onBack();
  };
  backButton.addEventListener('click', back);
  return { back, close };
}
