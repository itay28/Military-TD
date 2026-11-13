import { START_LIVES, START_MONEY } from './start';

/** How hard a game is, chosen when it starts (GLOSSARY: Difficulty). */
export type Difficulty = 'normal' | 'hard';

/** Every Difficulty, easiest first. */
export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard'];

export interface DifficultyRules {
  readonly label: string;
  /** Multiplies every enemy's HP (rounded to a whole number). */
  readonly hpScale: number;
  /** Multiplies every enemy's Reward (rounded, at least 1). */
  readonly rewardScale: number;
  /** Lives at the start, when the setup gives none. */
  readonly startLives: number;
  /** Money at the start, when the setup gives none. */
  readonly startMoney: number;
}

/** Tuned with the balance bots (`tests/maps/maps.test.ts`): the reference mix wins Hard, one tower kind alone loses. */
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  normal: { label: 'Normal', hpScale: 1, rewardScale: 1, startLives: START_LIVES, startMoney: START_MONEY },
  hard: { label: 'Hard', hpScale: 1.15, rewardScale: 0.9, startLives: 15, startMoney: 95 },
};

/** An enemy's Reward on `difficulty`: the base Reward × its `rewardScale`, rounded, and at least 1. */
export const scaledReward = (base: number, difficulty: Difficulty): number =>
  Math.max(1, Math.round(base * DIFFICULTY[difficulty].rewardScale));
