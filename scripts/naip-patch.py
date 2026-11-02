"""Cut a ground patch from USGS NAIP aerial imagery (public domain) for the art spike (ADR-0009, #286).

Reads a window of one NAIP scene (a cloud-optimized GeoTIFF on Microsoft Planetary Computer; a free SAS
token is fetched on the fly), centred on a point, `tiles` × `tiles` tiles of `metresPerTile` each, resampled
to `pxPerTile` pixels per tile, into assets/<id>/<id>.png.

Setup:  python3 -m venv .venv-art && .venv-art/bin/pip install rasterio pillow numpy
Run:    .venv-art/bin/python scripts/naip-patch.py
"""

import argparse
import json
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import transform
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parent.parent
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip/items/"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/naip"

# Pasture with a dirt track, a treeline and a crop-field edge: Story County, Iowa, NAIP 2023 at 0.3 m.
PATCHES = [
    {
        "id": "naip-field-road-treeline",
        "item": "ia_m_4209359_nw_15_030_20230902_20240104",
        "lon": -93.704355,
        "lat": 42.094992,
        "metresPerTile": 30,
        "tiles": 3,
    }
]


def cut(patch: dict, px_per_tile: int, out: Path) -> Path:
    item = json.load(urllib.request.urlopen(STAC + patch["item"]))
    token = json.load(urllib.request.urlopen(SAS))["token"]
    with rasterio.open(f"{item['assets']['image']['href']}?{token}") as src:
        xs, ys = transform("EPSG:4326", src.crs, [patch["lon"]], [patch["lat"]])
        half = patch["metresPerTile"] * patch["tiles"] / 2
        window = from_bounds(xs[0] - half, ys[0] - half, xs[0] + half, ys[0] + half, src.transform)
        size = px_per_tile * patch["tiles"]
        rgb = src.read([1, 2, 3], window=window, out_shape=(3, size, size), resampling=Resampling.lanczos)
    out = out / patch["id"]
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{patch['id']}.png"
    Image.fromarray(np.moveaxis(rgb, 0, -1)).save(path)
    print(f"wrote {path}")
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=ROOT / "assets", type=Path)
    ap.add_argument("--px-per-tile", default=128, type=int)
    args = ap.parse_args()
    for patch in PATCHES:
        cut(patch, args.px_per_tile, args.out)


if __name__ == "__main__":
    main()
