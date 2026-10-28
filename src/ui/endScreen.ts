import { TOWER_NAMES } from '../data/display';
import { isGameOver, type Game } from '../sim/game';
import { damageReport, type DamageReport, type ReportFigures } from '../sim/report';

/** The parts of the Game the End screen reads. */
export type EndScreenGame = Pick<Game, 'state'>;

export interface EndScreenOptions {
  /** Called when the player presses Restart. */
  readonly onRestart: () => void;
}

export interface EndScreen {
  /** Shows the overlay once the game is over; call once per frame. Writes only when it opens. */
  update(): void;
  /** Removes the overlay's elements and hides it; Restart and update() do nothing after this. */
  destroy(): void;
}

const TITLE_ID = 'end-screen-title';

/** A row's cells: the first is its header (`<th scope="row">`), the rest data. */
type Cells = readonly [string, ...string[]];

const figures = ({ damage, kills, dps }: ReportFigures): string[] => [String(damage), String(kills), dps.toFixed(1)];
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function buildTable(doc: Document, caption: string, headers: readonly string[], body: readonly Cells[], foot?: Cells) {
  const table = doc.createElement('table');
  table.createCaption().textContent = caption;
  const headRow = table.createTHead().insertRow();
  for (const text of headers) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    headRow.append(th);
  }
  const addRow = (section: HTMLTableSectionElement, [head, ...data]: Cells) => {
    const row = section.insertRow();
    const th = doc.createElement('th');
    th.scope = 'row';
    th.textContent = head;
    row.append(th);
    for (const text of data) row.insertCell().textContent = text;
  };
  const tbody = table.createTBody();
  for (const cells of body) addRow(tbody, cells);
  if (foot) addRow(table.createTFoot(), foot);
  return table;
}

/** The damage report's tables: by tower and by tower type (when any was placed), and by wave with a total. */
function buildReport(doc: Document, { towers, kinds, waves, total }: DamageReport): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (towers.length === 0) {
    const none = doc.createElement('p');
    none.dataset.testid = 'no-towers';
    none.textContent = 'No towers were placed.';
    parts.push(none);
  } else {
    parts.push(
      buildTable(
        doc,
        'By tower',
        ['Tower', 'Tile', 'Damage', 'Kills', 'DPS'],
        towers.map((row) => [
          `${TOWER_NAMES[row.kind]}${row.sold ? ' (sold)' : ''}`,
          `${row.tile.col}, ${row.tile.row}`,
          ...figures(row),
        ]),
      ),
      buildTable(
        doc,
        'By tower type',
        ['Type', 'Towers', 'Damage', 'Kills', 'DPS'],
        kinds.map((row) => [TOWER_NAMES[row.kind], String(row.towers), ...figures(row)]),
      ),
    );
  }
  parts.push(
    buildTable(
      doc,
      'By wave',
      ['Wave', 'Time', 'Damage', 'Kills', 'DPS'],
      waves.map((row) => [String(row.waveNumber), seconds(row.elapsedMs), ...figures(row)]),
      ['Total', seconds(total.elapsedMs), ...figures(total)],
    ),
  );
  return parts;
}

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
  const onClick = () => onRestart();
  restart.addEventListener('click', onClick);
  const report = doc.createElement('div');
  report.className = 'report';
  dialog.append(heading, wavesSurvived, report, restart);
  root.append(dialog);
  root.hidden = true;
  let destroyed = false;

  // The result can't change once the game is over (ticks stop), so it is written once, when the overlay opens.
  const update = () => {
    const { phase, wavesCleared, totalWaves } = game.state;
    if (destroyed || !root.hidden || !isGameOver(phase)) return;
    heading.textContent = phase === 'victory' ? 'Victory' : 'Defeat';
    wavesSurvived.textContent = `Waves survived ${wavesCleared} / ${totalWaves}`;
    report.replaceChildren(...buildReport(doc, damageReport(game.state.stats)));
    root.hidden = false;
    // Focusing the last child would scroll a tall report to the bottom, hiding the title.
    restart.focus({ preventScroll: true });
  };
  update();
  return {
    update,
    destroy() {
      destroyed = true;
      restart.removeEventListener('click', onClick);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
