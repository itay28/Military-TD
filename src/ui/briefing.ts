import { FACTION_INSIGNIA, FACTION_NAMES, TERMS } from '../data/display';
import type { MapEntry } from '../data/maps';
import type { Faction } from '../sim/factions';
import { createMap } from '../sim/map';
import { gridRefOf } from './mapCard';

export interface BriefingHandlers {
  /** Starts the operation. */
  readonly onDeploy: () => void;
  /** Back to the map cards. */
  readonly onBack: () => void;
}

let nextId = 0;

/** "▲ Friendly: US": the insignia is hidden from screen readers, which hear the side and the name. */
function force(doc: Document, side: 'Enemy' | 'Friendly', faction: Faction): HTMLElement {
  const line = doc.createElement('span');
  line.className = `force ${side.toLowerCase()}`;
  const insignia = doc.createElement('span');
  insignia.className = 'insignia';
  insignia.setAttribute('aria-hidden', 'true');
  insignia.textContent = FACTION_INSIGNIA[faction];
  line.append(insignia, ` ${side}: ${FACTION_NAMES[faction]}`);
  return line;
}

/**
 * The briefing the Operations screen shows for a picked map (#401): the operation name, the map and HQ's grid
 * reference, Situation, Forces and Terrain from the map's data, then Deploy and Back. No wave contents (#353).
 */
export function buildBriefing(doc: Document, entry: MapEntry, { onDeploy, onBack }: BriefingHandlers): HTMLElement {
  const panel = doc.createElement('section');
  panel.className = 'briefing';
  panel.dataset.testid = 'briefing';
  const heading = doc.createElement('h2');
  heading.id = `briefing-title-${nextId++}`;
  heading.textContent = entry.briefing.operation;
  panel.setAttribute('aria-labelledby', heading.id);
  const grid = doc.createElement('p');
  grid.className = 'grid-ref';
  grid.dataset.testid = 'briefing-grid';
  grid.textContent = `${entry.name} · HQ grid ${gridRefOf(createMap(entry.data))}`;

  const list = doc.createElement('dl');
  const item = (term: string, ...content: (Node | string)[]) => {
    const dt = doc.createElement('dt');
    dt.textContent = term;
    const dd = doc.createElement('dd');
    dd.append(...content);
    list.append(dt, dd);
  };
  item('Situation', entry.briefing.situation);
  item('Forces', force(doc, 'Enemy', entry.attacker), ' ', force(doc, 'Friendly', entry.defender));
  item('Terrain', entry.briefing.terrain);

  const actions = doc.createElement('div');
  actions.className = 'actions';
  const button = (text: string, onClick: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    actions.append(b);
    return b;
  };
  button(TERMS.play, onDeploy).className = 'deploy';
  button('Back', onBack);
  panel.append(heading, grid, list, actions);
  return panel;
}
