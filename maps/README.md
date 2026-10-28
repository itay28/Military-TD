# Maps

Tiled maps (`*.tmj`, ADR-0006). Each one is written by an agent as text but stays editable in [Tiled](https://www.mapeditor.org):

- a `ground` tile layer, the same size as the map, stored as CSV (an array of GIDs), not base64;
- tiles marked with the boolean tile property `buildable` where towers may stand, from tilesets **embedded** in the map;
- the Path as the one polyline object on a `path` object layer. Each point snaps to the tile it falls in, so put points on tile centres. Consecutive points share a row or column, and the Path runs from one map edge to an edge.

`importTiledMap` (`src/sim/tiled.ts`) converts a map to the sim's `MapData` and rejects a broken one with a reason. `tests/maps/maps.test.ts` imports every file here and has the reference bot (`fitOrder` in `tests/scenarios/bots.ts`, the balanced build order fitted to the map) win it. A map needs at least `MIN_BUILDABLE_TILES` buildable tiles off the Path.
