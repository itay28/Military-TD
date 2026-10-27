# Third-party assets

Every art, audio and font file we didn't make ourselves must be traceable to its source and license. CI enforces this from v0.4.0 (#60).

**Art direction:** the long-term look is satellite-style milsim art with factions per map ([ADR-0009](adr/0009-satellite-milsim-art-and-factions.md), proposed). The Kenney packs are placeholders until a faction's realistic set is complete.

## Allowed licenses

| License | OK? | Notes |
| --- | --- | --- |
| CC0-1.0 | ✅ | Preferred. Credit anyway (it's polite and costs nothing) |
| CC-BY-3.0 / CC-BY-4.0 | ✅ | Attribution text **must** be recorded and shown on the credits screen |
| OFL-1.1 | ✅ | Fonts only |
| CC-BY-SA, CC-BY-NC, "free for personal use", "royalty free" with no license text, unknown | ❌ | Don't commit |

## Layout

```
assets/
  manifest.json            one entry per pack (below)
  kenney-tower-defense/    files we actually use + the pack's original License.txt
  kenney-ui-pack/
  ...
CREDITS.md                 generated from manifest.json
```

## manifest.json entry

```json
{
  "id": "kenney-tower-defense",
  "name": "Tower Defense (Top-Down)",
  "author": "Kenney",
  "source": "https://kenney.nl/assets/tower-defense-top-down",
  "license": "CC0-1.0",
  "attribution": "Tower Defense (Top-Down) by Kenney (kenney.nl), CC0",
  "downloaded": "2026-10-24",
  "files": ["assets/kenney-tower-defense/**"]
}
```

## Adding an asset

1. Check the license on the **original** source page (not a re-upload).
2. Copy only the files you use into `assets/<pack-id>/`, plus the pack's license file.
3. Add or extend the manifest entry, then regenerate `CREDITS.md`.
4. Mention the pack in the PR description.

## Candidate sources

- **Kenney** (kenney.nl): CC0. Tower Defense (Top-Down), Top-down Tanks Redux, UI Pack, Impact/Interface sounds, Music Jingles.
- **OpenGameArt.org**: mixed licenses. Check each item.
- **itch.io free asset packs**: mixed licenses. Many are "free for personal use" only, which isn't allowed here.
