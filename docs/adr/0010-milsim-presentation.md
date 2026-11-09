# 10. Milsim presentation: clear terms, tactical look

Date: 2026-11-03 · Status: Accepted

## Context

The art is going milsim (ADR-0009), but the words and the look of the menus and HUD were still generic tower defense: Money, Lives, Play, Select map, Victory. The maintainer agreed a milsim presentation pass (2026-11-03), inspired by C&C Generals, Arma, Ready or Not and Bodycam. Inspiration only: no assets, names or lines from those games.

An early draft used words like "Supply", "Perimeter" and "Ready", which the maintainer found confusing. A military word is only worth it if a new player understands it at once.

## Decision

1. **Clear first, military second.** A term is renamed only when the military word is as clear as the plain one. Otherwise the plain word stays.
2. **Display names only.** The code, the sim and its events keep the domain terms (`money`, `lives`, Victory, Defeat; ADR-0002), so this decision is all in the UI and can be changed without touching the rules.
3. **One place for the words.** `TERMS` and its helpers in `src/data/display.ts` hold every renamed term. The HUD, menus, End screen, and later the How to play screen (#382), hints (#68) and tooltips (#69), take their words from there. `GLOSSARY.md` lists each display name next to its domain term.
4. **The terms:**

   | Domain term / old text | Shown as |
   | --- | --- |
   | Money | **Funds**, in dollars: "Funds $100", "Optics ($40)", "Sell (+$35)" |
   | Lives | **HQ**: a bar with the number ("HQ 14/20"), read to screen readers as "HQ 14 of 20". Each leak costs the enemy's leak cost, so a Tank (the heaviest) takes a big chunk |
   | Start Wave (button) | **Start wave**. A wave start shows a short **CONTACT — WAVE n** banner; the radio "Contact" call is #396 |
   | Play | **Deploy** |
   | Select map / Level select | **Operations** |
   | Victory / Defeat (End screen) | **MISSION COMPLETE** / **MISSION FAILED**, with an **After-action report** heading (spelled out, not "AAR") over the stats |
   | 🔒 Locked | "Locked: complete \<previous map\>" |

5. **No emoji anywhere in the UI.** Symbols that are text (★ ☆, ×, ▶) are fine; pictographs are not. `display.test.ts` checks the shared texts.
6. **The look** (#399): a stencil face for titles and headers (an OFL font, self-hosted in `assets/fonts/` since itch builds can't load Google Fonts at runtime); a monospace face for readouts and labels; body text stays plain and readable. A palette as CSS tokens: olive and dark green grounds, tan, amber readouts, and red kept for danger only, all at WCAG AA contrast. HUD and panels as thin frames with corner brackets, small-caps labels, and unit-designator names for a selected tower ("1-1 RIFLE NEST"). Phaser text uses the same faces. It must work with the text-size setting and the phone layout, with no layout shift when the fonts load.

## Consequences

- Tests and aria snapshots read the display names; sim tests keep the domain terms.
- A new player-facing term goes into `TERMS` first, and into `GLOSSARY.md` next to its domain term.
- The HQ bar's colours (green, amber at half, red at a quarter) always come with the number, so colour is never the only cue (#355).
