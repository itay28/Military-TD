"""Side-by-side of the Kenney placeholders and the ADR-0009 renders at 48 and 96 px per tile (spike #286).

Each row is one tile size. Left: the Kenney art as the game draws it today (grass and road tiles, the AA Gun
base and turret, the Tank body). Right: the NAIP ground patch with the rendered China AA Gun and Russia Tank.
The Tank is turned to follow the road in both.

Run after render-sprite.py and naip-patch.py:
    .venv-art/bin/python scripts/sprite-compare.py [--out docs/art/render-spike-compare.png]
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
KENNEY_TILE = 64  # the Kenney packs' tile size; the game scales them to TILE_PX
RENDER_TILE = 128  # render-sprite.json pxPerTile
TILES = 3
TANK_HEADING_DEG = 38  # counter-clockwise from north: up the NAIP patch's dirt track
LABEL_H = 22
GAP = 16


def load(rel: str) -> Image.Image:
    return Image.open(ROOT / rel).convert("RGBA")


def scaled(img: Image.Image, factor: float) -> Image.Image:
    return img.resize((max(1, round(img.width * factor)), max(1, round(img.height * factor))), Image.LANCZOS)


def paste_centred(canvas: Image.Image, sprite: Image.Image, cx: float, cy: float) -> None:
    canvas.alpha_composite(sprite, (round(cx - sprite.width / 2), round(cy - sprite.height / 2)))


def kenney_panel(tile: int) -> Image.Image:
    k = tile / KENNEY_TILE
    grass = scaled(load("assets/kenney-top-down-tanks/tileGrass1.png"), k)
    road = scaled(load("assets/kenney-top-down-tanks/tileGrass_roadNorth.png"), k)
    panel = Image.new("RGBA", (tile * TILES, tile * TILES))
    for row in range(TILES):
        for col in range(TILES):
            panel.alpha_composite(road if col == 1 else grass, (col * tile, row * tile))
    base = scaled(load("assets/kenney-tower-defense/towerDefense_tile180.png"), k)
    gun = scaled(load("assets/kenney-tower-defense/towerDefense_tile203.png"), k)
    paste_centred(panel, base, tile * 2.5, tile * 0.5)
    paste_centred(panel, gun, tile * 2.5, tile * 0.5)
    tank = scaled(load("assets/kenney-top-down-tanks/tankBody_sand.png"), k)
    paste_centred(panel, tank, tile * 1.5, tile * 1.5)
    return panel


def render_panel(tile: int) -> Image.Image:
    k = tile / RENDER_TILE
    panel = scaled(load("assets/naip-field-road-treeline/naip-field-road-treeline.png"), k)
    gun = scaled(load("assets/render-china-aa-gun/china-aa-gun.png"), k)
    paste_centred(panel, gun, tile * 0.5, tile * 2.5)
    tank = load("assets/render-russia-tank/russia-tank.png").rotate(
        TANK_HEADING_DEG, resample=Image.BICUBIC, expand=True
    )
    paste_centred(panel, scaled(tank, k), tile * 1.5, tile * 1.5)
    return panel


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=ROOT / "docs/art/render-spike-compare.png", type=Path)
    args = ap.parse_args()
    rows = [(tile, kenney_panel(tile), render_panel(tile)) for tile in (48, 96)]
    width = GAP + max(k.width + GAP + r.width for _, k, r in rows) + GAP
    height = GAP + sum(LABEL_H + k.height + GAP for _, k, _ in rows)
    sheet = Image.new("RGBA", (width, height), (32, 34, 30, 255))
    draw = ImageDraw.Draw(sheet)
    y = GAP
    for tile, kenney, render in rows:
        draw.text((GAP, y + 4), f"Kenney placeholder, {tile} px/tile", fill=(230, 230, 220, 255))
        draw.text((GAP * 2 + kenney.width, y + 4), f"ADR-0009 render, {tile} px/tile", fill=(230, 230, 220, 255))
        y += LABEL_H
        sheet.alpha_composite(kenney, (GAP, y))
        sheet.alpha_composite(render, (GAP * 2 + kenney.width, y))
        y += kenney.height + GAP
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
