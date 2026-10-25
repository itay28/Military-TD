# Military-TD

A basic military-themed tower defense game for the browser, built with TypeScript, Phaser 4 and Vite.

## Requirements

- Node.js 24 or newer (npm comes with it)

## Getting started

```sh
npm install        # also installs the pre-commit hook (Husky)
npm run dev        # dev server with hot reload at http://localhost:5173
```

## Scripts

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                                        |
| `npm run build`     | Typecheck, then build the game into `dist/`                      |
| `npm run preview`   | Serve the built `dist/` locally                                  |
| `npm test`          | Run the Vitest tests once (`npm run test:watch` to keep running) |
| `npm run test:e2e`  | Playwright UI tests on the built game, in headless Chromium      |
| `npm run lint`      | ESLint                                                           |
| `npm run typecheck` | TypeScript, no output                                            |
| `npm run format`    | Format code and config with Prettier                             |
| `npm run check`     | Typecheck, lint, format check and tests: run before a PR         |

The pre-commit hook formats and lints staged files, then runs the typecheck and the tests.

The build uses relative paths (`base: "./"`), so `dist/` works when served from any folder, including itch.io (ADR-0005).

## Playing builds (itch.io)

Every release goes to the game's itch.io page, `https://<ITCH_USER>.itch.io/<ITCH_GAME>` (ADR-0005). Until 1.0 the page is **Restricted**, so only invited people can open it:

- **Testers:** use the invite or the secret link the maintainer sent you, logged in to itch.io with the account it was sent to. The page shows the version in the bottom-right corner.
- **Maintainer:** invite testers from the project's **Edit game → Distribute → Restricted access** (by itch.io username or email), or share the page's **secret URL** from the same screen.

How a release gets there: merging the release PR publishes a GitHub Release, and the `deploy` job in `.github/workflows/release-please.yml` runs `.github/workflows/deploy.yml`. That builds the tag, checks it fits itch.io's HTML5 limits (`node scripts/itch-build.ts dist`, also run in CI), and pushes `dist/` with butler to the `html5` channel, with the release version as the build's version. To redeploy a tag by hand: **Actions → Deploy → Run workflow**, tag e.g. `v0.1.0`.

**One-time setup (maintainer):**

1. On itch.io, create a project: kind **HTML**, visibility **Restricted**. (**Draft** is fine while setting up, but only you can open a draft, so testers need **Restricted**.) After the first upload, tick **This file will be played in the browser** on the `html5` file, and set the embed size to **768 × 480** (the game's canvas; raise it when the HUD lands).
2. Create an API key: itch.io → **Settings → API keys**.
3. In the GitHub repo, **Settings → Secrets and variables → Actions**: add the secret `BUTLER_API_KEY` (the key), and the variables `ITCH_USER` (your itch.io username) and `ITCH_GAME` (the project's URL name).

Until all three are set, the deploy job fails with a message naming what's missing, and the Release workflow run shows red. The release itself still goes out.

## Project docs

- `docs/PLAN.md`: roadmap, game flow, architecture
- `GLOSSARY.md`: game vocabulary
- `docs/adr/`: decisions
- `docs/agents/workflow.md`: how changes get made
- `docs/agents/releasing.md`: releases, deploys, milestone close-out
- `docs/agents/session-tracker.html`: template for each session's tracker page
