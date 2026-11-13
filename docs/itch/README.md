# itch.io page kit

Everything the itch.io page needs (#374), ready to paste in (#82). The page stays **Restricted** at 1.0: only invited people can play (ADR-0005, maintainer's decision 2026-11-03). Builds get there by the Deploy workflow (`deploy.yml`, butler).

## Paste checklist

On itch: **Dashboard → Hold the Perimeter → Edit game**.

- [ ] **Title**: `Hold the Perimeter`.
- [ ] **Short description or tagline**: the **Tagline** section of [page.md](page.md).
- [ ] **Classification**: Games. **Kind of project**: HTML. **Release status**: In development until 1.0, then Released.
- [ ] **Uploads**: nothing by hand; the Deploy workflow pushes the HTML5 zip. Tick *This file will be played in the browser* on it.
- [ ] **Embed options**: viewport 1280 × 720, *Mobile friendly* on (landscape), *Fullscreen button* on, *Automatically start on page load* off.
- [ ] **Description**: the **Description**, **Controls** and **Credits** sections of [page.md](page.md), in that order (itch's editor takes pasted Markdown-rendered text; paste from a Markdown preview).
- [ ] **Genre**: Strategy. **Tags**: the **Tags** section of [page.md](page.md), one at a time.
- [ ] **Cover image**: [cover.png](cover.png) (630 × 500).
- [ ] **Screenshots** (up to 5 show on the page; 1920 × 1080 for sharp full-screen views, 1280 × 720 if the upload is slow):
  - [ ] [map-mvp-1920x1080.jpg](map-mvp-1920x1080.jpg) · [map-mvp-1280x720.jpg](map-mvp-1280x720.jpg): Training Ground mid-wave
  - [ ] [map-switchback-1920x1080.jpg](map-switchback-1920x1080.jpg) · [map-switchback-1280x720.jpg](map-switchback-1280x720.jpg): Switchback mid-wave
  - [ ] [map-serpentine-1920x1080.jpg](map-serpentine-1920x1080.jpg) · [map-serpentine-1280x720.jpg](map-serpentine-1280x720.jpg): Serpentine mid-wave
  - [ ] [map-hairpin-1920x1080.jpg](map-hairpin-1920x1080.jpg) · [map-hairpin-1280x720.jpg](map-hairpin-1280x720.jpg): Hairpin mid-wave
  - [ ] [level-select-1920x1080.jpg](level-select-1920x1080.jpg) · [level-select-1280x720.jpg](level-select-1280x720.jpg): the Operations screen
  - [ ] [end-screen-1920x1080.jpg](end-screen-1920x1080.jpg) · [end-screen-1280x720.jpg](end-screen-1280x720.jpg): a Victory
- [ ] **Gameplay GIF**: [wave.gif](wave.gif) (640 × 360, under 3 MB): add it as a screenshot (itch plays GIFs there) or drop it into the description.
- [ ] **Visibility & access**: **Restricted**, with the testers' download keys or the password. Not Public, also at 1.0.
- [ ] **Community**: comments on, so testers can report.

## Re-making the images

`npm run itch:shots` builds the game, plays it in headless Chromium with the balance bot and writes every image here (`tests/itch/capture.spec.ts`; the file list is `tests/itch/shots.ts`). It takes a few minutes. Fonts and GPU rendering differ between machines, so for the committed set run it in CI: **Actions → itch.io page kit → Run workflow**, then download the `itch-page-kit` artifact into this folder. `npm test` checks every file is here at its size (`tests/itch-kit.test.ts`). Re-make them when the look changes (new art, new maps) and update page.md when towers, enemies, maps or keys change: the same test fails when page.md misses one.
