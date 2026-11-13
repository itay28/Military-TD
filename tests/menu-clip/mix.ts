import type { Compression } from '../../scripts/menu-clip-audio';

/** How the menu clip's battle is muffled (#568): heard from inside a bunker, under the menu music. */
export const MENU_CLIP_MIX: {
  readonly bed: string;
  readonly bedFadeMs: number;
  /** The ambience bed's level against the battle's own sounds, in dB. */
  readonly bedDb: number;
  readonly cutoffHz: number;
  readonly compression: Compression;
  readonly peakDb: number;
} = {
  bed: 'assets/battlefield-ambience/combat.ogg',
  bedFadeMs: 2000,
  bedDb: -6,
  cutoffHz: 800,
  compression: { thresholdDb: -24, ratio: 4, attackMs: 8, releaseMs: 250 },
  peakDb: -12,
};
