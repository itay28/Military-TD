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
| `npm run lint`      | ESLint                                                           |
| `npm run typecheck` | TypeScript, no output                                            |
| `npm run format`    | Format code and config with Prettier                             |
| `npm run check`     | Typecheck, lint, format check and tests: run before a PR         |

The pre-commit hook formats and lints staged files, then runs the typecheck and the tests.

The build uses relative paths (`base: "./"`), so `dist/` works when served from any folder, including itch.io (ADR-0005).

## Project docs

- `docs/PLAN.md`: roadmap, game flow, architecture
- `GLOSSARY.md`: game vocabulary
- `docs/adr/`: decisions
- `docs/agents/workflow.md`: how changes get made
