/**
 * Switches for player-visible features that aren't kinds. PRs merge before their milestone ships, so a feature
 * stays hidden here until it is playable end to end; test mode (`?test=1`) shows them all, so specs still see them.
 * Turning one on is its own rollout issue.
 */

/** The Normal/Hard choice on the Level select (#466, #536). */
export const HARD_IN_PLAY = true;
