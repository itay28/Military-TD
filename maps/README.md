# Maps

Tiled maps (`*.tmj`, ADR-0006). Each one is written by an agent as text but stays editable in [Tiled](https://www.mapeditor.org):

- a `ground` tile layer, the same size as the map, stored as CSV (an array of GIDs), not base64;
- tiles marked with the boolean tile property `buildable` where towers may stand, from tilesets **embedded** in the map;
- the Path as the one polyline object on a `path` object layer. Each point snaps to the tile it falls in, so put points on tile centres. Consecutive points share a row or column, and the Path runs from one map edge to an edge.
- two string **map properties** (Map → Map Properties → Custom Properties), `attacker` and `defender`, each naming a Faction: `us`, `russia`, `china` or `insurgents` (ADR-0009). They pick the sprites of the enemies and the towers; rules never read them, so any pairing plays the same.

`importTiledMap` (`src/sim/tiled.ts`) converts a map to the sim's `MapData` and rejects a broken one with a reason. `tests/maps/maps.test.ts` imports every file here and has the reference bot (`fitOrder` in `tests/scenarios/bots.ts`, the balanced build order fitted to the map) win it. A map needs at least `MIN_BUILDABLE_TILES` buildable tiles off the Path.

`01-training-ground.tmj` is the MVP map (id `mvp`): Russia attacks, the US defends. `src/data/maps.ts` loads it through Vite (`?raw`); a new map is a new file here plus an entry in that registry. Its embedded tileset `kenney-td` gives each tile a `frame` property naming its atlas frame (a test checks they exist); what the game draws comes from `tileArt` (`src/scenes/tileset.ts`), which picks road shapes and decorations.
