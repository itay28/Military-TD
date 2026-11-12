import { DIFFICULTY } from '../data/difficulty';
import { TERMS, TOWER_NAMES } from '../data/display';
import { isGameOver, type Game } from '../sim/game';
import type { Stars } from '../sim/progression';
import {
  damageReport,
  type DamageReport,
  type KindReportRow,
  type ReportFigures,
  type TowerReportRow,
} from '../sim/report';

/** The parts of the Game the End screen reads. */
export type EndScreenGame = Pick<Game, 'state'>;

/** What a win earned: its Stars, and the name of the map it unlocked, if it unlocked one. */
export interface VictoryResult {
  readonly stars: Stars;
  readonly unlockedMap?: string;
  /** Won in Tactical mode, so the Stars were capped (ADR-0011). */
  readonly tactical?: boolean;
}

/** What the End screen and the Level select say while Tactical mode is on. */
export const TACTICAL_CAP_TEXT = 'Tactical: max 2 stars';

export interface EndScreenOptions {
  /** Called when the player presses Restart. */
  readonly onRestart: () => void;
  /** Called when the player presses Operations (the Level select). */
  readonly onLevelSelect: () => void;
  /** Read once when the overlay opens on a Victory; nothing is shown for it without one. */
  readonly result?: () => VictoryResult | undefined;
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

/** Damage is fractional (armor, HP cap), so it shows as a whole number; the sim keeps the exact figure. */
const figures = ({ damage, kills, dps }: ReportFigures): string[] => [
  String(Math.round(damage)),
  String(kills),
  dps.toFixed(1),
];
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function headerRow(doc: Document, table: HTMLTableElement, headers: readonly string[]) {
  const headRow = table.createTHead().insertRow();
  for (const text of headers) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    headRow.append(th);
  }
}

/** Adds a row whose first cell is its header; `head` is its text, or an element to put in it. */
function addRow(doc: Document, section: HTMLTableSectionElement, head: string | Node, data: readonly string[]) {
  const row = section.insertRow();
  const th = doc.createElement('th');
  th.scope = 'row';
  th.append(head);
  row.append(th);
  for (const text of data) row.insertCell().textContent = text;
  return row;
}

function buildTable(doc: Document, caption: string, headers: readonly string[], body: readonly Cells[], foot?: Cells) {
  const table = doc.createElement('table');
  table.createCaption().textContent = caption;
  headerRow(doc, table, headers);
  const tbody = table.createTBody();
  for (const [head, ...data] of body) addRow(doc, tbody, head, data);
  if (foot) addRow(doc, table.createTFoot(), foot[0], foot.slice(1));
  return table;
}

/**
 * By tower type: a row per kind, each with a toggle that shows or hides that kind's towers right beneath it
 * (#302). Each kind is its own pair of row groups, the kind's row then its towers, collapsed at first.
 */
function buildKindTable(doc: Document, kinds: readonly KindReportRow[], towers: readonly TowerReportRow[]) {
  const table = doc.createElement('table');
  table.createCaption().textContent = 'By tower type';
  headerRow(doc, table, ['Type', 'Towers', 'Damage', 'Kills', 'DPS']);
  for (const kind of kinds) {
    const name = TOWER_NAMES[kind.kind];
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'kind-toggle';
    toggle.textContent = name;
    addRow(doc, table.createTBody(), toggle, [String(kind.towers), ...figures(kind)]);
    const list = table.createTBody();
    list.id = `end-report-${kind.kind}-towers`;
    list.className = 'tower-rows';
    list.hidden = true;
    for (const tower of towers.filter((t) => t.kind === kind.kind)) {
      addRow(doc, list, `${name}${tower.sold ? ' (sold)' : ''}`, [
        `Tile ${tower.tile.col}, ${tower.tile.row}`,
        ...figures(tower),
      ]);
    }
    toggle.setAttribute('aria-controls', list.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      toggle.setAttribute('aria-expanded', String(!list.hidden));
    });
  }
  return table;
}

/** The damage report's tables: by tower type with each type's towers (when any was placed), and by wave with a total. */
function buildReport(doc: Document, { towers, kinds, waves, total }: DamageReport): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (towers.length === 0) {
    const none = doc.createElement('p');
    none.dataset.testid = 'no-towers';
    none.textContent = 'No towers were placed.';
    parts.push(none);
  } else {
    parts.push(buildKindTable(doc, kinds, towers));
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

/** "★★☆ 2 of 3 stars": the glyphs are hidden from screen readers, which read the words. */
function buildStars(doc: Document, stars: Stars): HTMLElement {
  const line = doc.createElement('p');
  line.dataset.testid = 'stars';
  const glyphs = doc.createElement('span');
  glyphs.className = 'star-glyphs';
  glyphs.setAttribute('aria-hidden', 'true');
  glyphs.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  line.append(glyphs, ` ${stars} of 3 stars`);
  return line;
}

function buildResult(doc: Document, { stars, unlockedMap, tactical }: VictoryResult): HTMLElement[] {
  const lines = [buildStars(doc, stars)];
  if (tactical) {
    const cap = doc.createElement('p');
    cap.dataset.testid = 'tactical-cap';
    cap.textContent = TACTICAL_CAP_TEXT;
    lines.push(cap);
  }
  if (unlockedMap !== undefined) {
    const unlocked = doc.createElement('p');
    unlocked.dataset.testid = 'unlocked';
    unlocked.textContent = `New map unlocked: ${unlockedMap}`;
    lines.push(unlocked);
  }
  return lines;
}

/** Builds the End screen inside `root`, an overlay over the canvas. It's DOM, so tests can query it (ADR-0003). */
export function mountEndScreen(
  root: HTMLElement,
  game: EndScreenGame,
  { onRestart, onLevelSelect, result }: EndScreenOptions,
): EndScreen {
  const doc = root.ownerDocument;
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const heading = doc.createElement('h2');
  heading.id = TITLE_ID;
  const wavesSurvived = doc.createElement('p');
  wavesSurvived.dataset.testid = 'waves-survived';
  const difficulty = doc.createElement('p');
  difficulty.dataset.testid = 'difficulty';
  const restart = doc.createElement('button');
  restart.type = 'button';
  restart.dataset.testid = 'restart';
  restart.textContent = 'Restart';
  const onClick = () => onRestart();
  restart.addEventListener('click', onClick);
  const levelSelect = doc.createElement('button');
  levelSelect.type = 'button';
  levelSelect.dataset.testid = 'level-select';
  levelSelect.textContent = TERMS.levelSelect;
  const onLevelSelectClick = () => onLevelSelect();
  levelSelect.addEventListener('click', onLevelSelectClick);
  const report = doc.createElement('div');
  report.className = 'report';
  const reportHeading = doc.createElement('h3');
  reportHeading.textContent = TERMS.report;
  dialog.append(heading, difficulty, reportHeading, wavesSurvived, report, restart, levelSelect);
  root.append(dialog);
  root.hidden = true;
  let destroyed = false;

  // The result can't change once the game is over (ticks stop), so it is written once, when the overlay opens.
  const update = () => {
    const { phase, wavesCleared, totalWaves } = game.state;
    if (destroyed || !root.hidden || !isGameOver(phase)) return;
    heading.textContent = phase === 'victory' ? TERMS.victory : TERMS.defeat;
    difficulty.textContent = `${TERMS.difficulty}: ${DIFFICULTY[game.state.difficulty].label}`;
    wavesSurvived.textContent = `Waves survived ${wavesCleared} / ${totalWaves}`;
    const won = phase === 'victory' ? result?.() : undefined;
    if (won) heading.after(...buildResult(doc, won));
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
      levelSelect.removeEventListener('click', onLevelSelectClick);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
