// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { FACTION_INSIGNIA, FACTION_NAMES } from '../data/display';
import { mapById } from '../data/maps';
import { buildBriefing } from './briefing';

const entry = mapById('mvp');
const build = (handlers: Partial<Parameters<typeof buildBriefing>[2]> = {}) =>
  buildBriefing(document, entry, { onDeploy: () => {}, onBack: () => {}, ...handlers });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('briefing (#401)', () => {
  it('is a region named by its heading, the operation name', () => {
    const panel = build();
    const heading = panel.querySelector('h2');
    expect(heading?.textContent).toBe(entry.briefing.operation);
    expect(panel.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(panel.tagName).toBe('SECTION');
  });

  it('gives the map name and the grid reference of HQ', () => {
    expect(text(build().querySelector('[data-testid="briefing-grid"]'))).toBe(`${entry.name} · HQ grid D2`);
  });

  it('lists Situation, Forces and Terrain, in that order', () => {
    const panel = build();
    expect([...panel.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Situation', 'Forces', 'Terrain']);
    const [situation, forces, terrain] = [...panel.querySelectorAll('dd')];
    expect(situation?.textContent).toBe(entry.briefing.situation);
    expect(text(forces)).toBe(
      `${FACTION_INSIGNIA[entry.attacker]} Enemy: ${FACTION_NAMES[entry.attacker]} ${FACTION_INSIGNIA[entry.defender]} Friendly: ${FACTION_NAMES[entry.defender]}`,
    );
    expect(terrain?.textContent).toBe(entry.briefing.terrain);
  });

  it('hides the insignia from screen readers, which hear the faction names', () => {
    const insignia = [...build().querySelectorAll('.insignia')];
    expect(insignia).toHaveLength(2);
    expect(insignia.every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('says nothing about the waves (that is Sniper intel, #353)', () => {
    expect(build().textContent).not.toMatch(/wave/i);
  });

  it('ends with Deploy and Back buttons that call their handlers', () => {
    const onDeploy = vi.fn();
    const onBack = vi.fn();
    const panel = build({ onDeploy, onBack });
    const buttons = [...panel.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Deploy', 'Back']);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
    buttons[0]!.click();
    expect(onDeploy).toHaveBeenCalledOnce();
    buttons[1]!.click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('FACTION_INSIGNIA', () => {
  it('is a plain geometric mark per faction, all different: no flags or national emblems (ADR-0009)', () => {
    const marks = Object.values(FACTION_INSIGNIA);
    expect(new Set(marks).size).toBe(marks.length);
    for (const mark of marks) expect(mark).toMatch(/^[▲◆■●✕]$/u);
  });
});
