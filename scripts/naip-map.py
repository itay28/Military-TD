"""Paint one ground image per Tiled map from USGS NAIP aerial imagery (public domain): ADR-0009, #312.

For each map in MAPS, this script reads the map's `.tmj` and cuts a window of a pinned NAIP field at 30 m per tile
(the render spike's scale, #286). It paints the map's Path on that window as a dirt track: a soft-edged band about a
third of a tile wide, textured from a NAIP crop of bare ground, with two wheel ruts and worn grass along it. Blocked
tiles (neither Path nor buildable) get a NAIP treeline crop with feathered edges. The image goes to
assets/naip-maps/<id>.jpg at `pxPerTile` (96) pixels per tile. The map's `ground-image` image layer points at that
file, and the game draws it in place of the tile sprites.

Everything is pinned: the NAIP scene, the window centres (in the scene's UTM metres) and the noise seed. A rerun
writes the same image.

Setup:  python3.11 -m venv .venv-art && .venv-art/bin/pip install rasterio pillow numpy
Run:    .venv-art/bin/python scripts/naip-map.py
"""

import argparse
import json
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageFilter
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parent.parent
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip/items/"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/naip"

METRES_PER_TILE = 30
# The Path's dirt track: its half width and where the two wheel ruts run, as fractions of a tile.
TRACK_HALF_WIDTH = 0.2
RUT_OFFSET = 0.08
# How far the track cuts each corner, as a fraction of a tile: vehicles round them, the Path's tiles stay square.
CORNER_CUT = 0.3
# The side of the square of bare ground the track's texture repeats, in metres: small enough to hold no bush.
DIRT_SIDE_M = 36
# The colour of the spike's real dirt track (assets/naip-field-road-treeline), as RGB.
DIRT_RGB = (168, 160, 112)

# Story County, Iowa, NAIP 2023 at 0.3 m (the spike's scene). Centres are easting and northing in its EPSG:26915.
IOWA_2023 = "ia_m_4209359_nw_15_030_20230902_20240104"
MAPS = [
    {
        "map": "maps/01-training-ground.tmj",
        "id": "training-ground",
        "item": IOWA_2023,
        # A pasture with no track or building in it.
        "field": (438345, 4658349),
        # A mown hay field: the dirt track's texture.
        "dirt": (441624, 4660705),
        # A dense wood: the treeline on blocked tiles.
        "trees": (440950, 4662770),
        "seed": 312,
    }
]


def read_window(src, centre: tuple[float, float], width_m: float, height_m: float, out_w: int, out_h: int):
    """The NAIP RGB window of `width_m` × `height_m` around `centre`, resampled to out_w × out_h, as float 0–255."""
    x, y = centre
    window = from_bounds(x - width_m / 2, y - height_m / 2, x + width_m / 2, y + height_m / 2, src.transform)
    rgb = src.read([1, 2, 3], window=window, out_shape=(3, out_h, out_w), resampling=Resampling.lanczos)
    return np.moveaxis(rgb, 0, -1).astype(np.float32)


def smooth_noise(rng, height: int, width: int, cell: int) -> np.ndarray:
    """Value noise in -1..1 that varies over about `cell` pixels: random values on a coarse grid, blurred up."""
    coarse = rng.uniform(0, 255, (height // cell + 2, width // cell + 2)).astype(np.uint8)
    up = Image.fromarray(coarse).resize((width + 2 * cell, height + 2 * cell), Image.BICUBIC)
    up = up.filter(ImageFilter.GaussianBlur(cell / 3))
    return np.asarray(up, dtype=np.float32)[cell : cell + height, cell : cell + width] / 127.5 - 1


def path_points(tmj: dict, scale: float) -> np.ndarray:
    """The Path polyline in image pixels, each end pushed a tile past the map edge so the track runs off it."""
    line = next(o for layer in tmj["layers"] if layer["name"] == "path" for o in layer["objects"] if "polyline" in o)
    points = np.array([(line["x"] + p["x"], line["y"] + p["y"]) for p in line["polyline"]], dtype=np.float32) * scale
    tile = tmj["tilewidth"] * scale
    for end, inner in ((0, 1), (-1, -2)):
        direction = points[end] - points[inner]
        points[end] = points[end] + direction / np.linalg.norm(direction) * tile
    return round_corners(points, CORNER_CUT * tile)


def round_corners(points: np.ndarray, cut: float) -> np.ndarray:
    """The polyline with each inner corner replaced by a curve that starts `cut` pixels before it and ends after it."""
    out = [points[0]]
    for before, corner, after in zip(points[:-2], points[1:-1], points[2:]):
        a = corner + (before - corner) / np.linalg.norm(before - corner) * cut
        b = corner + (after - corner) / np.linalg.norm(after - corner) * cut
        # A quadratic Bezier from a to b with the corner as its control point.
        out += [(1 - t) ** 2 * a + 2 * (1 - t) * t * corner + t**2 * b for t in np.linspace(0, 1, 9)]
    out.append(points[-1])
    return np.array(out, dtype=np.float32)


def distance_to_polyline(points: np.ndarray, height: int, width: int) -> np.ndarray:
    """Each pixel's distance to the nearest segment of the polyline."""
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32) + 0.5
    best = np.full((height, width), np.inf, dtype=np.float32)
    for a, b in zip(points[:-1], points[1:]):
        ab = b - a
        t = np.clip(((xs - a[0]) * ab[0] + (ys - a[1]) * ab[1]) / float(ab @ ab), 0, 1)
        best = np.minimum(best, np.hypot(xs - (a[0] + t * ab[0]), ys - (a[1] + t * ab[1])))
    return best


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def blocked_mask(tmj: dict, px_per_tile: int, feather: float) -> np.ndarray:
    """1 on blocked tiles (not buildable, not Path), feathered over `feather` pixels; 0 elsewhere."""
    ground = next(layer for layer in tmj["layers"] if layer["name"] == "ground")
    buildable = set()
    for tileset in tmj["tilesets"]:
        for tile in tileset.get("tiles", []):
            if any(p["name"] == "buildable" and p["value"] is True for p in tile.get("properties", [])):
                buildable.add(tileset["firstgid"] + tile["id"])
    cols, rows = tmj["width"], tmj["height"]
    roads = {
        tileset["firstgid"] + tile["id"]
        for tileset in tmj["tilesets"]
        for tile in tileset.get("tiles", [])
        if any(p["name"] == "frame" and "road" in str(p["value"]) for p in tile.get("properties", []))
    }
    grid = np.array(
        [0 if (gid & 0x0FFFFFFF) in buildable | roads else 255 for gid in ground["data"]], dtype=np.uint8
    ).reshape(rows, cols)
    mask = Image.fromarray(grid).resize((cols * px_per_tile, rows * px_per_tile), Image.NEAREST)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32) / 255


def paint(spec: dict, px_per_tile: int, out_dir: Path) -> Path:
    tmj = json.loads((ROOT / spec["map"]).read_text())
    cols, rows = tmj["width"], tmj["height"]
    width, height = cols * px_per_tile, rows * px_per_tile
    width_m, height_m = cols * METRES_PER_TILE, rows * METRES_PER_TILE
    rng = np.random.default_rng(spec["seed"])

    item = json.load(urllib.request.urlopen(STAC + spec["item"]))
    token = json.load(urllib.request.urlopen(SAS))["token"]
    with rasterio.open(f"{item['assets']['image']['href']}?{token}") as src:
        field = read_window(src, spec["field"], width_m, height_m, width, height)
        side = round(DIRT_SIDE_M / METRES_PER_TILE * px_per_tile)
        dirt = read_window(src, spec["dirt"], DIRT_SIDE_M, DIRT_SIDE_M, side, side)
        trees = read_window(src, spec["trees"], width_m, height_m, width, height)

    # Treeline on blocked tiles, its edge broken up by noise so it doesn't follow the grid.
    blocked = blocked_mask(tmj, px_per_tile, px_per_tile * 0.12)
    if blocked.any():
        edge = smoothstep(0.35, 0.65, blocked + 0.25 * smooth_noise(rng, height, width, px_per_tile // 4))
        field = field * (1 - edge[..., None]) + trees * edge[..., None]

    # The dirt track: the bare ground's detail (its own mean removed), mirrored to fill the map, over the real track's
    # colour. Mirroring keeps the repeats seamless.
    detail = np.clip(dirt - blur(dirt, px_per_tile / 16), -30, 30)
    detail = np.concatenate([detail, detail[::-1]], axis=0)
    detail = np.concatenate([detail, detail[:, ::-1]], axis=1)
    reps = (-(-height // detail.shape[0]), -(-width // detail.shape[1]), 1)
    soil = np.array(DIRT_RGB, dtype=np.float32) + 0.8 * np.tile(detail, reps)[:height, :width]
    # Patches of damper and drier soil, so the repeats don't show.
    soil = soil * (1 + 0.07 * smooth_noise(rng, height, width, px_per_tile // 2))[..., None]
    points = path_points(tmj, px_per_tile / tmj["tilewidth"])
    wobble = smooth_noise(rng, height, width, px_per_tile // 3)
    d = distance_to_polyline(points, height, width) + wobble * px_per_tile * 0.02
    half = TRACK_HALF_WIDTH * px_per_tile
    track = 1 - smoothstep(half * 0.7, half * 1.15, d)
    # Two wheel ruts, a little darker, and the middle strip a little grassy.
    rut_at = RUT_OFFSET * px_per_tile
    ruts = np.exp(-(((d - rut_at) / (px_per_tile * 0.018)) ** 2))
    middle = np.exp(-((d / (px_per_tile * 0.03)) ** 2))
    soil = soil * (1 - 0.12 * ruts[..., None])
    soil = soil * (1 - 0.35 * middle[..., None]) + field * (0.35 * middle[..., None])
    # Worn, drier grass along both sides.
    worn = smoothstep(half * 2.2, half * 1.0, d) * (1 - track)
    field = field * (1 - 0.25 * worn[..., None]) + soil * (0.25 * worn[..., None])
    image = field * (1 - track[..., None]) + soil * track[..., None]

    out = out_dir / "naip-maps"
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{spec['id']}.jpg"
    Image.fromarray(np.clip(image, 0, 255).astype(np.uint8)).save(path, quality=85, optimize=True)
    print(f"wrote {path} ({width}×{height})")
    return path


def blur(rgb: np.ndarray, sigma: float) -> np.ndarray:
    """`rgb` (height × width × channels) Gaussian-blurred by `sigma` pixels: one 1-D pass along each axis."""
    radius = int(3 * sigma)
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    padded = np.pad(rgb, ((radius, radius), (radius, radius), (0, 0)), mode="reflect")
    rows = sum(k * padded[i : i + rgb.shape[0]] for i, k in enumerate(kernel))
    return sum(k * rows[:, i : i + rgb.shape[1]] for i, k in enumerate(kernel))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=ROOT / "assets", type=Path)
    ap.add_argument("--px-per-tile", default=96, type=int)
    args = ap.parse_args()
    for spec in MAPS:
        paint(spec, args.px_per_tile, args.out)


if __name__ == "__main__":
    main()
