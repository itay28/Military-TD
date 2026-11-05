/**
 * Volume (#67): what each audio channel plays at, from the player's settings and whether the tab is visible.
 * Presentation only, so it lives outside `src/sim`.
 */
import { MAX_VOLUME, type Settings, type SettingsStore } from '../settings/settings';

/** A channel with its own volume setting. */
export type Channel = 'music' | 'sfx';

const CHANNEL_FIELD = { music: 'musicVolume', sfx: 'sfxVolume' } as const satisfies Record<Channel, keyof Settings>;

/** The volume a channel plays at, 0–1: master × channel. 0 when either is 0. */
export function effectiveVolume(settings: Settings, channel: Channel): number {
  return (settings.masterVolume / MAX_VOLUME) * (settings[CHANNEL_FIELD[channel]] / MAX_VOLUME);
}

/** The part of `document` the mix needs, so tests can fake a tab being hidden and shown. */
export interface VisibilityDoc {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface AudioMix {
  /** The volume `channel` plays at now, 0–1: its effective volume, or 0 while the tab is hidden. */
  volume(channel: Channel): number;
  /** Calls `listener` when a volume may have changed (a setting, or the tab hidden or shown), until unsubscribed. */
  subscribe(listener: () => void): () => void;
}

/** The game's one mix: the music controller and the SFX sink both read it, so the sliders and a hidden tab reach both. */
export function createAudioMix(settings: SettingsStore, doc: VisibilityDoc): AudioMix {
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  settings.subscribe(notify);
  doc.addEventListener('visibilitychange', notify);
  return {
    volume: (channel) => (doc.hidden ? 0 : effectiveVolume(settings.get(), channel)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
