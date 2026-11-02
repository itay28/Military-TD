"""Render top-down sprites from 3D models with headless Blender (ADR-0009, spike #286).

Each model in scripts/render-sprite.json is downloaded from Sketchfab (token in SKETCHFAB_API_TOKEN) into the
ignored .cache/models/ folder; source models are never committed. It is rendered straight down with an
orthographic camera, a fixed sun from the top-left, a soft ground shadow (Cycles shadow catcher), a slight
desaturation and a transparent background, at `pxPerTile` pixels per tile, facing north (the game's
TURRET_FACING / SPRITE_HEADING for the Kenney sprites it replaces).

Three PNGs per model in <out>/render-<id>/, all framed by the same camera so they line up:
  <id>.png         the whole model with its shadow (previews, the side-by-side)
  <id>-hull.png    everything but the turret, with the hull's shadow
  <id>-turret.png  the turret (and barrels) alone, no shadow, for the game to rotate

A model's optional `exclude` lists meshes to delete before rendering (e.g. add-on slat armour that hides the
silhouette). `tint` multiplies the textured paint by `color` (minus materials named in `skip`; `overrides` gives a
material its own `color` and `specular`), for a model painted in the wrong colour.

Setup:  python3 -m venv .venv-art && .venv-art/bin/pip install bpy==5.0.1
Run:    .venv-art/bin/python scripts/render-sprite.py [--only <id>] [--out assets]
"""

import argparse
import json
import math
import os
import sys
import urllib.request
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
FRONT = {"+y": 0.0, "-x": -math.pi / 2, "-y": math.pi, "+x": math.pi / 2}  # Z rotation that turns the front to +Y


def download(uid: str, cache: Path) -> Path:
    """The model's .glb, downloaded once through the Sketchfab API."""
    path = cache / f"{uid}.glb"
    if path.exists():
        return path
    token = os.environ.get("SKETCHFAB_API_TOKEN")
    if not token:
        sys.exit(f"{uid}: not in {cache} and SKETCHFAB_API_TOKEN is unset (sketchfab.com → Settings → Password & API)")
    req = urllib.request.Request(
        f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {token}"}
    )
    with urllib.request.urlopen(req) as res:
        url = json.load(res)["glb"]["url"]
    cache.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(path)
    return path


def is_turret(obj, rule: dict) -> bool:
    if obj.name in rule.get("names", []):
        return True
    under = set(rule.get("under", []))
    parent = obj.parent
    while parent is not None:
        if parent.name in under:
            return True
        parent = parent.parent
    return False


def world_bounds(meshes) -> tuple[Vector, Vector]:
    pts = [m.matrix_world @ Vector(c) for m in meshes for c in m.bound_box]
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def tint_untextured(color: list[float]) -> None:
    """Give materials that lost their texture (plain base colour, no image) `color`, so they don't render white."""
    for mat in bpy.data.materials:
        bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
        if bsdf and not bsdf.inputs["Base Color"].links:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)


def tint_paint(color: list[float], skip: list[str], overrides: dict[str, dict]) -> None:
    """Multiply every textured base colour by `color` (a grey-painted model turned olive).

    `skip` keeps materials whose name starts with an entry. `overrides` gives a material (by name prefix) its own
    `color` and, optionally, `specular` (Principled "Specular IOR Level"), for a part that renders lighter than
    the rest: a pale texture, or flat tops mirroring the sky.
    """
    for mat in bpy.data.materials:
        tree = mat.node_tree
        bsdf = tree.nodes.get("Principled BSDF") if tree else None
        if not bsdf or not bsdf.inputs["Base Color"].links or any(mat.name.startswith(s) for s in skip):
            continue
        link = bsdf.inputs["Base Color"].links[0]
        mix = tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        own = next((o for prefix, o in overrides.items() if mat.name.startswith(prefix)), {})
        mix.inputs["B"].default_value = (*own.get("color", color), 1.0)
        if "specular" in own:
            bsdf.inputs["Specular IOR Level"].default_value = own["specular"]
        tree.links.new(link.from_socket, mix.inputs["A"])
        tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


def place_model(spec: dict) -> None:
    """Turn the model's front north, stand it on z = 0 and scale it so its north-south length is `lengthTiles`.

    One Blender unit is one tile from here on.
    """
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    turn = Matrix.Rotation(FRONT[spec["frontAxis"]], 4, "Z")
    roots = [o for o in bpy.data.objects if o.parent is None]
    for o in roots:
        o.matrix_world = turn @ o.matrix_world
    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    scale = spec["lengthTiles"] / (hi.y - lo.y)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    fit = Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)
    for o in roots:
        o.matrix_world = fit @ o.matrix_world
    bpy.context.view_layer.update()


def build_stage(cfg: dict, spec: dict) -> object:
    """Camera, sun, sky fill and the shadow-catching ground. Returns the ground plane."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = cfg.get("samples", 64)
    try:
        scene.cycles.use_denoising = True
    except AttributeError:
        pass
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    px = round(spec["canvasTiles"] * cfg["pxPerTile"])
    scene.render.resolution_x = scene.render.resolution_y = px
    scene.render.resolution_percentage = 100

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = spec["canvasTiles"]
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0, 0, 20)  # looking straight down (-Z), image up = +Y = north
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun_cfg = cfg["sun"]
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = sun_cfg["strength"]
    sun_data.angle = math.radians(sun_cfg["softnessDeg"])
    sun = bpy.data.objects.new("Sun", sun_data)
    # A sun light shines along its local -Z. Tilt it off vertical, then turn it so the light comes from the
    # azimuth (compass degrees, 315 = north-west = top-left of the screen).
    tilt = math.radians(90 - sun_cfg["elevationDeg"])
    az = math.radians(sun_cfg["azimuthDeg"])
    sun.rotation_euler = (tilt, 0, -(az + math.pi))  # the light travels toward azimuth + 180°
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.6, 0.7, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=50, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    ground.is_shadow_catcher = True
    return ground


def desaturate(path: Path, amount: float) -> None:
    """Mix each pixel's colour `amount` of the way to its grey (Rec. 709 luma); alpha is untouched."""
    img = bpy.data.images.load(str(path))
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        r, g, b = px[i], px[i + 1], px[i + 2]
        y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        px[i], px[i + 1], px[i + 2] = r + (y - r) * amount, g + (y - g) * amount, b + (y - b) * amount
    img.pixels = px
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def render(path: Path, cfg: dict) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    desaturate(path, cfg["desaturate"])
    print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


def render_model(cfg: dict, spec: dict, cache: Path, out: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(download(spec["sketchfab"], cache)))
    for name in spec.get("exclude", []):
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    if "tint" in spec:
        tint_paint(spec["tint"]["color"], spec["tint"].get("skip", []), spec["tint"].get("overrides", {}))
    if "untexturedColor" in spec:
        tint_untextured(spec["untexturedColor"])
    place_model(spec)
    ground = build_stage(cfg, spec)
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o is not ground]
    turret = [o for o in meshes if is_turret(o, spec["turret"])]
    hull = [o for o in meshes if o not in turret]
    if not turret:
        sys.exit(f"{spec['id']}: the turret rule matched no mesh")
    out = out / f"render-{spec['id']}"
    out.mkdir(parents=True, exist_ok=True)

    def show(objs, with_ground):
        for o in meshes:
            o.hide_render = o not in objs
        ground.hide_render = not with_ground

    show(meshes, True)
    render(out / f"{spec['id']}.png", cfg)
    show(hull, True)
    render(out / f"{spec['id']}-hull.png", cfg)
    show(turret, False)
    render(out / f"{spec['id']}-turret.png", cfg)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=ROOT / "scripts/render-sprite.json", type=Path)
    ap.add_argument("--out", default=ROOT / "assets", type=Path)
    ap.add_argument("--cache", default=ROOT / ".cache/models", type=Path)
    ap.add_argument("--only", help="render just this model id")
    ap.add_argument("--samples", type=int, help="Cycles samples (default 64)")
    args = ap.parse_args(argv)
    cfg = json.loads(args.config.read_text())
    if args.samples:
        cfg["samples"] = args.samples
    for spec in cfg["models"]:
        if args.only in (None, spec["id"]):
            render_model(cfg, spec, args.cache, args.out)


if __name__ == "__main__":
    main()
