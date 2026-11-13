import { describe, expect, it } from 'vitest';
import { mapById } from '../data/maps';
import { MENU_CLIP } from '../data/menuClip';
import { SOUND_FALLOFF } from '../data/sounds';
import { TICK_MS } from '../sim/game';
import { clipTicks, createMenuClipGame } from '../sim/menuClip';
import { menuClipSounds } from './clipSounds';
import { SOUND_IDS } from './sounds';

const entry = mapById(MENU_CLIP.mapId);
const sounds = menuClipSounds(MENU_CLIP, entry.data, entry.defender);

describe('menuClipSounds', () => {
  it('times every sound inside one loop, in order, at a volume between the falloff floor and full', () => {
    expect(sounds.length).toBeGreaterThan(50);
    for (const { ms, id, volume } of sounds) {
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(MENU_CLIP.loopMs);
      expect(SOUND_IDS).toContain(id);
      expect(volume).toBeGreaterThanOrEqual(SOUND_FALLOFF.minVolume);
      expect(volume).toBeLessThanOrEqual(1);
    }
    expect(sounds.map((s) => s.ms)).toEqual([...sounds.map((s) => s.ms)].sort((a, b) => a - b));
  });

  it("holds a shot for each of the scene's shots and a blast for each kill, and no radio cues", () => {
    const game = createMenuClipGame(MENU_CLIP, entry.data);
    for (let i = 0; i < clipTicks(MENU_CLIP.warmUpMs); i++) game.tick(TICK_MS);
    let shells = 0;
    let vehicleKills = 0;
    let infantryKills = 0;
    game.events.on('shellFired', () => shells++);
    game.events.on('enemyKilled', ({ enemy }) => (enemy.kind === 'infantry' ? infantryKills++ : vehicleKills++));
    for (let i = 0; i < clipTicks(MENU_CLIP.loopMs); i++) game.tick(TICK_MS);
    const count = (id: string) => sounds.filter((s) => s.id === id).length;
    expect(count('mortarLaunch')).toBe(shells);
    expect(count('mortarBlast')).toBe(shells);
    expect(count('vehicleExplosion')).toBe(vehicleKills);
    expect(count('infantryHit')).toBe(infantryKills);
    expect(count('rifleShot')).toBeGreaterThan(0);
    for (const radio of ['leak', 'waveStart', 'waveReinforcements', 'victory', 'defeat', 'coldOpen'])
      expect(count(radio)).toBe(0);
  });

  it('is the same every run', () => {
    expect(menuClipSounds(MENU_CLIP, entry.data, entry.defender)).toEqual(sounds);
  });
});
