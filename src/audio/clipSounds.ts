import type { MenuClip } from '../data/menuClip';
import { SOUND_FALLOFF, SOUND_THROTTLE, SOUND_THROTTLE_BY_ID, WHISTLE_LEAD_MS } from '../data/sounds';
import type { Faction } from '../sim/factions';
import { TICK_MS } from '../sim/game';
import type { MapData, Position } from '../sim/map';
import { tileCenter } from '../sim/map';
import { clipPanAt, clipTicks, createMenuClipGame } from '../sim/menuClip';
import { throttleAudio } from './audioOut';
import { distanceVolume } from './distance';
import { soundFor, type SoundEvent, type SoundId } from './sounds';
import { createWhistleTracker } from './whistle';

/** One sound of the menu clip's track: `ms` into the loop, at `volume` (0–1) for its distance from the camera. */
export interface ClipSound {
  readonly ms: number;
  readonly id: SoundId;
  readonly volume: number;
}

/**
 * The menu clip's battle sounds over one loop (#568), from the scene's own events as the game plays them: each shot,
 * shell launch, incoming whistle, blast and kill, through `soundFor`, the same throttle and the same falloff from the
 * camera's centre (the pan). No radio cues: the menu has its own. It plays the clip from the start, through the
 * warm-up, so `ms` 0 is the video's first frame.
 */
export function menuClipSounds(clip: MenuClip, map: MapData, defender: Faction): ClipSound[] {
  const game = createMenuClipGame(clip, map);
  const warmUpTicks = clipTicks(clip.warmUpMs);
  const endTicks = warmUpTicks + clipTicks(clip.loopMs);
  let tick = 0;
  const clipMs = () => (tick - warmUpTicks) * TICK_MS;
  const sounds: ClipSound[] = [];
  const audio = throttleAudio(
    {
      play: (id, volume = 1) => {
        if (tick >= warmUpTicks) sounds.push({ ms: clipMs(), id, volume });
      },
    },
    SOUND_THROTTLE,
    () => tick * TICK_MS,
    SOUND_THROTTLE_BY_ID,
  );
  const play = (event: SoundEvent, at: Position | undefined): void => {
    const id = soundFor(event, defender);
    if (id === null) return;
    const center = clipPanAt(clip, clipMs());
    audio.play(id, at ? distanceVolume(Math.hypot(at.x - center.x, at.y - center.y), SOUND_FALLOFF) : 1);
  };
  const shot = (type: 'towerFired' | 'shellFired', towerId: number): void => {
    const tower = game.state.towers.find((t) => t.id === towerId);
    play({ type, kind: tower?.kind }, tower && tileCenter(tower.tile));
  };
  game.events.on('towerFired', ({ towerId }) => shot('towerFired', towerId));
  game.events.on('shellFired', ({ towerId }) => shot('shellFired', towerId));
  game.events.on('shellLanded', ({ position }) => play({ type: 'shellLanded' }, position));
  game.events.on('enemyKilled', ({ enemy }) => play({ type: 'enemyKilled', enemy: enemy.kind }, enemy.position));
  const whistles = createWhistleTracker(WHISTLE_LEAD_MS);
  for (; tick < endTicks; tick++) {
    game.tick(TICK_MS);
    // As the scene does: after the frame's ticks, on the sim's clock.
    for (const shell of whistles.due(game.state.shells, game.state.timeMs))
      play({ type: 'shellIncoming' }, shell.target);
  }
  return sounds;
}
