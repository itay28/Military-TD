import { describe, expect, it } from 'vitest';
import { ENEMY_STATS, NOT_IN_PLAY } from './enemies';
import { CLASS_LINES, fieldManualEntries } from './fieldManual';
import { BUILD_KINDS } from './towers';

describe('fieldManualEntries', () => {
  const entries = fieldManualEntries();

  it('has every tower, then every enemy kind, each with a class line', () => {
    expect(entries.map((e) => e.kind)).toEqual([
      ...BUILD_KINDS,
      ...Object.keys(ENEMY_STATS).filter((k) => !NOT_IN_PLAY.has(k as keyof typeof ENEMY_STATS)),
    ]);
    expect(entries.filter((e) => e.group === 'tower')).toHaveLength(BUILD_KINDS.length);
    for (const entry of entries) {
      expect(entry.classLine).toBe(CLASS_LINES[entry.kind]);
      expect(entry.classLine.length).toBeGreaterThan(10);
      expect(entry.role.length).toBeGreaterThan(10);
    }
  });

  it("lists a tower's stats from the data", () => {
    const cannon = entries.find((e) => e.kind === 'cannon')!;
    expect(cannon.name).toBe('Cannon');
    expect(Object.fromEntries(cannon.stats)).toMatchObject({
      Cost: '100',
      Damage: '60',
      Range: '3 tiles',
      'Fire rate': '0.5 shots/s',
      Targets: 'Ground',
      'Armor pierce': '8',
      Upgrades: 'Optics (80), Heavier weapon (140)',
    });
    expect(cannon.effectiveLabel).toBe('Effective against');
    expect(cannon.effective).toContain('Tank');
    expect(cannon.weak).toContain('Helicopter');
  });

  it("lists an enemy's stats from the data", () => {
    const heli = entries.find((e) => e.kind === 'helicopter')!;
    expect(Object.fromEntries(heli.stats)).toEqual({
      HP: '130',
      Armor: '4',
      Speed: '1.2 tiles/s',
      Layer: 'Air',
      'Leak cost': '2 Lives',
    });
    expect(heli.effectiveLabel).toBe('Weak against');
    expect(heli.effective).toContain('AA Gun');
    expect(heli.weakLabel).toBe('Shrugs off');
    expect(heli.weak).toEqual(expect.arrayContaining(['Cannon', 'Mortar']));
  });

  it('names no tower that is not in play in an enemy entry (ADR-0009)', () => {
    for (const e of entries.filter((x) => x.group === 'enemy')) {
      expect(e.effective).not.toContain('Sniper');
      expect(e.weak).not.toContain('Sniper');
    }
  });
});
