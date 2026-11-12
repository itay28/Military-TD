"""A Faction's rendered sprite set on NAIP grass, to check every sprite reads (issue #314, ADR-0009).

Row 1: each kind at 48 px per tile (the game's TILE_PX), on a plain-grass crop of the NAIP patch.
Row 2: the same at 128 px per tile (the render resolution), on grass.
Row 3: the turret layer alone at 128 px on a neutral grey, with its pivot marked (kinds without a turret: blank).
Art-ahead kinds (rendered before their gameplay, e.g. the Sniper, #358) get a last column when the Faction has one.

Run after render-sprite.py and `npm run render:pivot` (needs Pillow in the art venv):
    .venv-art/bin/python scripts/faction-sheet.py us [--out docs/art/faction-us.png]
With `--kind`, the columns are one kind across every Faction instead (#509):
    .venv-art/bin/python scripts/faction-sheet.py --kind heavyTank [--out docs/art/heavyTank.png]
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RENDER_TILE = 128  # render-sprite.json pxPerTile
GAME_TILE = 48
NAIP_GRASS_BOX = (0, 192, 128, 320)  # a plain-grass crop of the NAIP patch, in its own pixels (sprite-compare.py)
CELL = 2.5  # tiles per cell, enough for the largest canvas (the jet's, for its offset shadow; the Gunship's is 1.75)
FACTIONS = ["us", "russia", "china", "insurgents"]
KINDS = ["rifleNest", "aaGun", "cannon", "mortar", "infantry", "jeep", "tank", "heavyTank", "helicopter", "gunship", "jet"]
PENDING = {"jet"}  # kinds a faction may not have yet (#482: China and Insurgents jets come in the next part)
# v0.8.0 kinds rendered one Faction at a time ahead of their gameplay (#360, #358): on the sheet once the Faction has one.
NEW_KINDS = ["apc", "sniper"]


def grass(px: int) -> Image.Image:
    naip = Image.open(ROOT / "assets/naip-field-road-treeline/naip-field-road-treeline.png").convert("RGBA")
    return naip.crop(NAIP_GRASS_BOX).resize((px, px), Image.LANCZOS)


def place(sheet: Image.Image, sprite: Image.Image, scale: float, cx: int, cy: int) -> None:
    w = round(sprite.width * scale)
    s = sprite.resize((w, w), Image.LANCZOS)
    sheet.alpha_composite(s, (cx - w // 2, cy - w // 2))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("faction", nargs="?", help="one Faction's set, a column per kind")
    ap.add_argument("--kind", help="one kind across every Faction, a column per Faction")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--assets", type=Path, default=ROOT / "assets", help="where the render-<id>/ folders are")
    args = ap.parse_args()
    if (args.faction is None) == (args.kind is None):
        raise SystemExit("give a Faction or --kind, not both")
    cfg = json.loads((ROOT / "scripts/render-sprite.json").read_text())
    if args.kind:
        found = {m["faction"]: m for m in cfg["models"] if m["kind"] == args.kind}
        labels, name, default_out = FACTIONS, args.kind, f"docs/art/{args.kind}.png"
    else:
        found = {m["kind"]: m for m in cfg["models"] if m["faction"] == args.faction}
        labels, name, default_out = KINDS, args.faction, f"docs/art/faction-{args.faction}.png"
    if not args.kind:
        labels = KINDS + [k for k in NEW_KINDS if k in found]
    pending = lambda l: (l in PENDING) if args.kind is None else False
    missing = [k for k in labels if k not in found and not pending(k)]
    if missing:
        raise SystemExit(f"{name}: no model for {', '.join(missing)}")
    small, big = round(CELL * GAME_TILE), round(CELL * RENDER_TILE)
    width = len(labels) * big
    sheet = Image.new("RGBA", (width, small + 2 * big), (40, 40, 40, 255))
    draw = ImageDraw.Draw(sheet)
    for i, label in enumerate(labels):
        x = i * big
        if label not in found:
            draw.text((x + 4, small + 2 * big - 14), f"{label}: pending", fill=(255, 255, 255, 255))
            continue
        m = found[label]
        folder = args.assets / f"render-{m['id']}"
        whole = Image.open(folder / f"{m['id']}.png").convert("RGBA")
        sheet.alpha_composite(grass(small), (x + (big - small) // 2, 0))
        place(sheet, whole, GAME_TILE / RENDER_TILE, x + big // 2, small // 2)
        sheet.alpha_composite(grass(big), (x, small))
        place(sheet, whole, 1, x + big // 2, small + big // 2)
        draw.rectangle((x, small + big, x + big - 1, small + 2 * big - 1), fill=(128, 128, 128, 255))
        turret = folder / f"{m['id']}-turret.png"
        if turret.exists():
            t = Image.open(turret).convert("RGBA")
            ox, oy = x + (big - t.width) // 2, small + big + (big - t.height) // 2
            sheet.alpha_composite(t, (ox, oy))
            meta = folder / f"{m['id']}.json"
            pivot = json.loads(meta.read_text()).get("pivot") if meta.exists() else None
            if pivot:
                px, py = ox + pivot["x"], oy + pivot["y"]
                draw.ellipse((px - 3, py - 3, px + 3, py + 3), outline=(255, 200, 0, 255), width=2)
        draw.text((x + 4, small + 2 * big - 14), label, fill=(255, 255, 255, 255))
    out = args.out or ROOT / default_out
    sheet.convert("RGB").save(out)
    print(f"wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
