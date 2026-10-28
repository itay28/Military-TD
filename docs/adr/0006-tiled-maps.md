# 6. Author maps in Tiled; import and validate them in code

Date: 2026-10-24 · Status: Accepted

## Context

1.0 needs 4–5 maps. Hand-writing map data in TypeScript is fine for one map but painful for several, especially once maps use a real tileset. Asset packs provide tiles but no Paths or buildable areas. Building our own editor is a lot of work for a side project.

## Decision

Maps are drawn in [Tiled](https://www.mapeditor.org) (free, open source) and committed as Tiled JSON (`maps/*.tmj`, tilesets embedded or as `.tsj` next to them):

- a **ground** tile layer (appearance only);
- the **Path** as a polyline object on a `path` object layer;
- **buildable** tiles marked with a boolean tile property `buildable`.

An importer in `src/sim` converts a map file into sim map data, so the rules never depend on Tiled's format directly. Every map in `maps/` is checked by tests: the Path is connected, starts and ends on an edge, has enough buildable tiles, and a reference bot strategy can win it.

## Consequences

- Humans edit maps visually; agents edit the same JSON as text. CI rejects a broken map.
- The MVP map was rebuilt in Tiled with the art tileset in v0.4.0 (`maps/01-training-ground.tmj`, #59); no map is defined in code any more.
- An in-game editor for players stays out of scope until after 1.0.
