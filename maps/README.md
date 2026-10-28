# Maps

Tiled maps (`*.tmj`, ADR-0006). Each one is written by an agent as text but stays editable in [Tiled](https://www.mapeditor.org):

- a `ground` tile layer, the same size as the map, stored as CSV (an array of GIDs), not base64;
- tiles marked with the boolean tile property `buildable` where towers may stand, from tilesets **embedded** in the map;
- the Path as the one polyline object on a `path` object layer. Each point snaps to the tile it falls in, so put points on tile centres. Consecutive points share a row or column, and the Path runs from one map edge to an edge.

`importTiledMap` (`src/sim/tiled.ts`) converts a map to the sim's `MapData` and rejects a broken one with a reason. `tests/maps/maps.test.ts` imports every file here and has the reference bot (`fitOrder` in `tests/scenarios/bots.ts`, the balanced build order fitted to the map) win it. A map needs at least `MIN_BUILDABLE_TILES` buildable tiles off the Path.

`01-training-ground.tmj` is the MVP map (id `mvp`); `02-switchback.tmj` (id `switchback`) enters on the top edge and winds down an S-curve to the bottom; `03-serpentine.tmj` (id `serpentine`) is the long one, snaking down and up through five columns; `04-hairpin.tmj` (id `hairpin`) runs in from the left and doubles back two rows lower, so towers between the stretches cover both. Difficulty rises from map 1 to map 4. `src/data/maps.ts` loads them through Vite (`?raw`); a new map is a new file here plus an entry in that registry, with its own wave schedule (`waves`, from `src/data/waves.ts`), which `setUpGame` plays on it. The maps test finds each file's entry and has the reference bot win it with those waves. Its embedded tileset `kenney-td` gives each tile a `frame` property naming its atlas frame (a test checks they exist); what the game draws comes from `tileArt` (`src/scenes/tileset.ts`), which picks road shapes and decorations.
