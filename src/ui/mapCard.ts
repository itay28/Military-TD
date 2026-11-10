import { MAP_CARD, MAP_GRID, TILE_PX } from '../data/display';
import type { MapEntry } from '../data/maps';
import { drawMap } from '../scenes/drawMap';
import { gridLabel } from '../scenes/mapGrid';
import { createMap, type GameMap, type Tile } from '../sim/map';
import { canvasPainter, PREVIEW_TILE_PX, type PreviewContext } from './mapPreview';

// The Operations screen's map card (#401): the map's aerial ground image with a tactical overlay on top, the map grid
// (#400), the route as a dashed red line, the entry and exit, and the grid reference of HQ.

interface Point {
  readonly x: number;
  readonly y: number;
}

/** What the overlay draws, in canvas pixels. Pure, so tests check the geometry without a canvas. */
export interface TacticalOverlay {
  readonly width: number;
  readonly height: number;
  readonly gridLines: readonly { x1: number; y1: number; x2: number; y2: number }[];
  /** The route through each waypoint's tile centre, entry to exit. */
  readonly route: readonly Point[];
  readonly entry: Point;
  readonly exit: Point;
  /** The grid square HQ stands in (the exit's), such as "D2". */
  readonly gridRef: string;
}

/** The overlay of `map` at `tilePx` canvas pixels a tile. */
export function tacticalOverlay(map: GameMap, tilePx: number = PREVIEW_TILE_PX): TacticalOverlay {
  const width = map.cols * tilePx;
  const height = map.rows * tilePx;
  const cellPx = MAP_GRID.cellTiles * tilePx;
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = cellPx; x < width; x += cellPx) gridLines.push({ x1: x, y1: 0, x2: x, y2: height });
  for (let y = cellPx; y < height; y += cellPx) gridLines.push({ x1: 0, y1: y, x2: width, y2: y });
  const centre = ({ col, row }: Tile): Point => ({ x: (col + 0.5) * tilePx, y: (row + 0.5) * tilePx });
  const route = map.waypoints.map(centre);
  const exitTile = map.waypoints[map.waypoints.length - 1]!;
  return {
    width,
    height,
    gridLines,
    route,
    entry: route[0]!,
    exit: route[route.length - 1]!,
    gridRef: gridLabel(exitTile),
  };
}

/** The part of a 2D canvas context the overlay draws with, so tests can pass a recording fake. */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'globalAlpha'
  | 'lineWidth'
  | 'font'
  | 'textBaseline'
  | 'setLineDash'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'arc'
  | 'closePath'
  | 'fillRect'
  | 'fillText'
  | 'strokeText'
>;

/** Draws the overlay: grid, then the dashed route, the entry dot and exit square, then "GRID D2" in the top-left corner. */
export function drawTacticalOverlay(ctx: OverlayContext, overlay: TacticalOverlay): void {
  const { grid, route, entry, exit, label } = MAP_CARD;
  ctx.setLineDash([]);
  ctx.globalAlpha = grid.alpha;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = grid.width;
  ctx.beginPath();
  for (const { x1, y1, x2, y2 } of overlay.gridLines) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  ctx.globalAlpha = route.alpha;
  ctx.strokeStyle = route.color;
  ctx.lineWidth = route.width;
  ctx.setLineDash([...route.dash]);
  ctx.beginPath();
  overlay.route.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 1;
  ctx.fillStyle = entry.color;
  ctx.beginPath();
  ctx.arc(overlay.entry.x, overlay.entry.y, entry.radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = exit.color;
  ctx.beginPath();
  ctx.moveTo(overlay.exit.x - exit.size / 2, overlay.exit.y - exit.size / 2);
  ctx.lineTo(overlay.exit.x + exit.size / 2, overlay.exit.y - exit.size / 2);
  ctx.lineTo(overlay.exit.x + exit.size / 2, overlay.exit.y + exit.size / 2);
  ctx.lineTo(overlay.exit.x - exit.size / 2, overlay.exit.y + exit.size / 2);
  ctx.closePath();
  ctx.fill();

  const text = `GRID ${overlay.gridRef}`;
  ctx.font = label.font;
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.strokeStyle = label.stroke;
  ctx.strokeText(text, label.insetPx, label.insetPx);
  ctx.fillStyle = label.color;
  ctx.fillText(text, label.insetPx, label.insetPx);
}

/**
 * A map card's picture: the aerial ground image (`data-testid="map-ground"`) under a canvas with the tactical overlay.
 * A map with no aerial image yet gets the drawn tileset preview on the same canvas, under the overlay. Both are hidden
 * from screen readers: the card's button names the map.
 */
export function buildMapCard(doc: Document, { data, groundImageUrl }: MapEntry): HTMLElement {
  const map = createMap(data);
  const overlay = tacticalOverlay(map, PREVIEW_TILE_PX);
  const card = doc.createElement('span');
  card.className = 'map-card';
  if (groundImageUrl !== undefined) {
    const img = doc.createElement('img');
    img.src = groundImageUrl;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.dataset.testid = 'map-ground';
    img.width = overlay.width;
    img.height = overlay.height;
    card.append(img);
  }
  const canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = overlay.width;
  canvas.height = overlay.height;
  if (groundImageUrl === undefined) canvas.dataset.ground = 'drawn';
  // happy-dom has no 2D context; the canvas keeps its size and stays blank there.
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (groundImageUrl === undefined) drawMap(canvasPainter(ctx as PreviewContext, PREVIEW_TILE_PX / TILE_PX), map);
    drawTacticalOverlay(ctx, overlay);
  }
  card.append(canvas);
  return card;
}
