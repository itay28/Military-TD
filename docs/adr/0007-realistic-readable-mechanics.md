# 7. Realistic, readable mechanics with no hard counters

Date: 2026-10-25 · Status: Accepted

## Context

v0.2.0 adds tower and enemy kinds, armor and air units. Tower defense games often balance these with hard counters: only the AA tower hits air, armor makes small arms useless. The player then has to build one specific unit or lose, and the rules feel arbitrary.

We want a player to understand the game with real-world logic: why a tank shrugs off rifle fire, why a mortar misses a fast jeep. The game should still be balanced and fun.

## Decision

1. **Real cause, readable effect.** Every mechanic has a real-world reason the player can reason about, and it shows as one number or one visible effect. Examples:
   - armor takes a flat amount off each hit
   - a shell takes time to land, so it hits where the target was
   - a tower being dismantled stops firing
2. **No hard counters.** Counters are a matter of degree, never on/off:
   - a weapon is good or bad against a target, rarely useless
   - every enemy kind can be killed efficiently by **at least two** tower kinds
   - no tower kind is required to win
3. **Checked by tests, not by feel** (ADR-0003):
   - a data test computes damage per Money, after armor, for every tower kind against every enemy kind, and fails if any enemy kind has fewer than two efficient counters
   - the balance bots (#16) check that a balanced mix wins and that a single tower kind struggles
4. **Simple first.** When realism and readability conflict, pick the version a player can predict, and leave depth for later. For example: two splash rings rather than a falloff curve, and the shell lands where the target was rather than leading it.

### Applied in v0.2.0

| Unit | Real logic | Effect |
| --- | --- | --- |
| Rifle Nest | Small arms can hit low-flying helicopters | Hits ground and air; weak against armor |
| AA Gun | AA guns were used against ground targets too | Hits air and ground; fast, light rounds that tank armor stops |
| Cannon | An anti-tank gun fires armor-piercing shells | One target, high damage, `armorPierce`; ground only |
| Mortar | High-explosive shells arc in, with a blast | Minimum range, about 1 s flight time, splash in two rings (full / half); ground only |
| Tank | Armor | Flat `armor` off each hit; a hit always does at least 1 |
| Helicopter | Flies; light armor | `air` layer, `armor` 2 |
| Selling | You can't pull a crew out of a fight instantly | Dismantling takes 2 s; the tower stops firing at once, refund when done |
| Upgrades | Better equipment | Level 2: better optics (range); level 3: heavier weapon (damage, fire rate) |

Upgrades and selling are first versions, to be revisited once they're played.

## Consequences

- No unit is mandatory, so more strategies work and balance is about efficiency, not access.
- Some mechanics cost more to build than the hard-counter version: shells with flight time need a projectile system in the sim, and selling needs a dismantling state.
- New tower or enemy kinds must keep the "at least two efficient counters" test green. A kind that needs a hard counter to be interesting goes against this ADR and needs a new decision.
