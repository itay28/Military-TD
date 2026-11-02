"""Side-by-side of the Kenney placeholders and the ADR-0009 renders (spike #286).

Rows 1 and 2 are the in-game scene at 48 and 96 px per tile. Left: the Kenney art as the game draws it today
(grass and road tiles, the AA Gun base and turret, the Tank body). Right: the NAIP ground patch with the rendered
China AA Gun and Russia Tank. Both panels put the tower in the same cell (bottom-left) and the Tank in the middle,
turned to follow the road, and mark them with the same rings (amber: tower, cyan: unit) so the eye finds the
dark-green AA Gun on grass.

Row 3 is a close-up: each sprite on its own at 128 px per tile (the render resolution), on a neutral grey and on
a grass crop from the NAIP patch, next to the Kenney sprite at the same size.

Run after render-sprite.py and naip-patch.py:
    .venv-art/bin/python scripts/sprite-compare.py [--out docs/art/render-spike-compare.png]
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
KENNEY_TILE = 64  # the Kenney packs' tile size; the game scales them to TILE_PX
RENDER_TILE = 128  # render-sprite.json pxPerTile
TILES = 3
TANK_HEADING_DEG = 38  # counter-clockwise from north: up the NAIP patch's dirt track
TOWER_CELL = (0.5, 2.5)  # tile centre, in tiles: grass in both panels
TANK_CELL = (1.5, 1.5)  # on the road / track
CLOSE_TILE = 128
NAIP_GRASS_BOX = (0, 192, 128, 320)  # a plain-grass crop of the NAIP patch, in its own pixels

BG = (32, 34, 30, 255)
INK = (232, 232, 222, 255)
MUTED = (160, 162, 152, 255)
TOWER_RING = (255, 191, 0, 255)
UNIT_RING = (0, 214, 255, 255)
GAP = 20


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    names = ["DejaVuSans-Bold.ttf", "Inter-SemiBold.otf"] if bold else ["DejaVuSans.ttf", "Inter-Regular.otf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            for d in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/opentype/inter"):
                try:
                    return ImageFont.truetype(f"{d}/{name}", size)
                except OSError:
                    pass
    return ImageFont.load_default(size)


TITLE = font(22, bold=True)
HEAD = font(16, bold=True)
BODY = font(14)


def load(rel: str) -> Image.Image:
    return Image.open(ROOT / rel).convert("RGBA")


def scaled(img: Image.Image, factor: float) -> Image.Image:
    return img.resize((max(1, round(img.width * factor)), max(1, round(img.height * factor))), Image.LANCZOS)


def paste_centred(canvas: Image.Image, sprite: Image.Image, cx: float, cy: float) -> None:
    canvas.alpha_composite(sprite, (round(cx - sprite.width / 2), round(cy - sprite.height / 2)))


def ring(canvas: Image.Image, cx: float, cy: float, r: float, colour: tuple) -> None:
    """A dashed ring with a dark halo so it reads on both bright and dark ground."""
    draw = ImageDraw.Draw(canvas)
    w = max(2, round(r / 14))
    box = (cx - r, cy - r, cx + r, cy + r)
    draw.ellipse(box, outline=(0, 0, 0, 150), width=w + 2)
    for start in range(0, 360, 30):
        draw.arc(box, start, start + 20, fill=colour, width=w)


def kenney_tower(k: float) -> Image.Image:
    base = scaled(load("assets/kenney-tower-defense/towerDefense_tile180.png"), k)
    base.alpha_composite(scaled(load("assets/kenney-tower-defense/towerDefense_tile203.png"), k))
    return base


def kenney_tank(k: float) -> Image.Image:
    return scaled(load("assets/kenney-top-down-tanks/tankBody_sand.png"), k)


def render_tank() -> Image.Image:
    return load("assets/render-russia-tank/russia-tank.png").rotate(TANK_HEADING_DEG, Image.BICUBIC, expand=True)


def mark(panel: Image.Image, tile: int) -> None:
    ring(panel, TOWER_CELL[0] * tile, TOWER_CELL[1] * tile, tile * 0.47, TOWER_RING)
    ring(panel, TANK_CELL[0] * tile, TANK_CELL[1] * tile, tile * 0.8, UNIT_RING)


def kenney_panel(tile: int) -> Image.Image:
    k = tile / KENNEY_TILE
    grass = scaled(load("assets/kenney-top-down-tanks/tileGrass1.png"), k)
    road = scaled(load("assets/kenney-top-down-tanks/tileGrass_roadNorth.png"), k)
    panel = Image.new("RGBA", (tile * TILES, tile * TILES))
    for row in range(TILES):
        for col in range(TILES):
            panel.alpha_composite(road if col == 1 else grass, (col * tile, row * tile))
    paste_centred(panel, kenney_tower(k), TOWER_CELL[0] * tile, TOWER_CELL[1] * tile)
    paste_centred(panel, kenney_tank(k), TANK_CELL[0] * tile, TANK_CELL[1] * tile)
    mark(panel, tile)
    return panel


def render_panel(tile: int) -> Image.Image:
    k = tile / RENDER_TILE
    panel = scaled(load("assets/naip-field-road-treeline/naip-field-road-treeline.png"), k)
    gun = scaled(load("assets/render-china-aa-gun/china-aa-gun.png"), k)
    paste_centred(panel, gun, TOWER_CELL[0] * tile, TOWER_CELL[1] * tile)
    paste_centred(panel, scaled(render_tank(), k), TANK_CELL[0] * tile, TANK_CELL[1] * tile)
    mark(panel, tile)
    return panel


def tile_card(sprite: Image.Image, ground: Image.Image | tuple, size: int) -> Image.Image:
    card = ground.resize((size, size)) if isinstance(ground, Image.Image) else Image.new("RGBA", (size, size), ground)
    paste_centred(card, sprite, size / 2, size / 2)
    return card


def close_up() -> list[tuple[str, Image.Image]]:
    """(caption, card) pairs at CLOSE_TILE px per tile; the Tank cards are 1.5 tiles to fit its gun."""
    k = CLOSE_TILE / KENNEY_TILE
    grass = load("assets/naip-field-road-treeline/naip-field-road-treeline.png").crop(NAIP_GRASS_BOX)
    grey = (120, 122, 116, 255)
    gun = load("assets/render-china-aa-gun/china-aa-gun.png")
    tank = load("assets/render-russia-tank/russia-tank.png")
    tank_card = round(CLOSE_TILE * 1.5)
    return [
        ("Kenney tower", tile_card(kenney_tower(k), grey, CLOSE_TILE)),
        ("AA Gun, grey", tile_card(gun, grey, CLOSE_TILE)),
        ("AA Gun, grass", tile_card(gun, grass, CLOSE_TILE)),
        ("Kenney tank", tile_card(kenney_tank(k), grey, tank_card)),
        ("Tank, grey", tile_card(tank, grey, tank_card)),
        ("Tank, grass", tile_card(tank, grass, tank_card)),
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=ROOT / "docs/art/render-spike-compare.png", type=Path)
    args = ap.parse_args()

    rows = [(tile, kenney_panel(tile), render_panel(tile)) for tile in (48, 96)]
    cards = close_up()
    scene_w = max(k.width + GAP + r.width for _, k, r in rows)
    cards_w = sum(c.width for _, c in cards) + GAP * (len(cards) - 1)
    width = GAP * 2 + max(scene_w, cards_w)
    head_h, label_h = 64, 26
    height = (
        GAP
        + head_h
        + sum(label_h + k.height + GAP * 2 for _, k, _ in rows)
        + label_h
        + max(c.height for _, c in cards)
        + label_h
        + GAP
    )
    sheet = Image.new("RGBA", (width, height), BG)
    draw = ImageDraw.Draw(sheet)

    y = GAP
    draw.text((GAP, y), "Art spike: Kenney placeholder vs ADR-0009 render", font=TITLE, fill=INK)
    y += 34
    x = GAP
    for colour, text in ((TOWER_RING, "tower: AA Gun"), (UNIT_RING, "unit: Tank")):
        draw.ellipse((x, y + 3, x + 12, y + 15), outline=colour, width=3)
        draw.text((x + 18, y), text, font=BODY, fill=MUTED)
        x += 18 + round(draw.textlength(text, font=BODY)) + 24
    y = GAP + head_h

    for tile, kenney, render in rows:
        draw.text((GAP, y), f"Kenney, {tile} px/tile", font=HEAD, fill=INK)
        right = GAP * 2 + max(kenney.width, round(draw.textlength(f"Kenney, {tile} px/tile", font=HEAD)))
        draw.text((right, y), f"Render, {tile} px/tile", font=HEAD, fill=INK)
        y += label_h
        sheet.alpha_composite(kenney, (GAP, y))
        sheet.alpha_composite(render, (right, y))
        y += kenney.height + GAP * 2

    draw.text((GAP, y), f"Close-up, {CLOSE_TILE} px/tile (render resolution)", font=HEAD, fill=INK)
    y += label_h
    x = GAP
    for caption, card in cards:
        sheet.alpha_composite(card, (x, y))
        draw.text((x, y + card.height + 6), caption, font=BODY, fill=MUTED)
        x += card.width + GAP

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.out, optimize=True)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
