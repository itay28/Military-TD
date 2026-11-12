// ADR-0009's legal guardrail: the rendered models depict real equipment (`scripts/render-sprite.json`'s `depicts`),
// but no player-visible text names it. These helpers find the names a test bans.

/** Trade names and nicknames in the `depicts` lines that carry no digits, so the code pattern misses them. */
const TRADE_NAMES = [
  'Abrams',
  'Apache',
  'Black Hawk',
  'Brave Warrior',
  'CROWS',
  'DShK',
  'Hilux',
  'Humvee',
  'Oerlikon',
  'Phalanx',
  'Pindad',
  'Podnos',
  'Rapira',
  'Ratnik',
  'Tiger',
  'Toyota',
  'Vulcan',
  'AKM',
  'TOW',
  'UAZ',
  'ZPU',
] as const;

/** A model code: letters, an optional hyphen and digits (T-72B3, M1A2, ZU-23-2, Mi-8, QBZ-191), or digit-letter-digit (2B14). */
const CODE = /\b(?:[A-Z][A-Za-z]{0,3}-?\d[A-Za-z0-9]*(?:-\d+[A-Za-z0-9]*)*|\d[A-Z]\d+)\b/g;
/** "Type 99A", "Type 07": a Chinese type number. */
const TYPE = /\bType \d+[A-Z]?\b/g;
/** The leading code of a variant: T-72 of T-72B3, ZU-23 of ZU-23-2, M1A2 of M1A2. */
const STEM = /^[A-Z][A-Za-z]{0,3}-?\d+/;

/** Every `depicts` line of a render list (`scripts/render-sprite.json`). */
export function allDepicts(renders: { readonly models: readonly { readonly depicts?: string }[] }): string[] {
  return renders.models.flatMap((model) => (model.depicts ? [model.depicts] : []));
}

/** The designations and trade names named in `lines`, each once, variants with their stem (T-72B3 and T-72). */
export function designationsIn(lines: readonly string[]): string[] {
  const found = new Set<string>();
  for (const line of lines) {
    for (const [code] of line.matchAll(CODE)) {
      found.add(code);
      const stem = STEM.exec(code)?.[0];
      if (stem) found.add(stem);
    }
    for (const [type] of line.matchAll(TYPE)) {
      found.add(type);
      found.add(type.replace(/[A-Z]$/, ''));
    }
    for (const name of TRADE_NAMES) if (new RegExp(`\\b${name}\\b`).test(line)) found.add(name);
  }
  return [...found];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first of `banned` that `text` names as a whole word (case-sensitive), or undefined when it names none. */
export function findDesignation(text: string, banned: readonly string[]): string | undefined {
  return banned.find((name) => new RegExp(`(?<![A-Za-z0-9-])${escape(name)}(?![A-Za-z0-9-])`).test(text));
}
