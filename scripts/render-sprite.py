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
A model without a `turret` (a kind with no turning part: Infantry, Jeep, Helicopter) gets just <id>.png.

`turret` picks meshes by `names`, by the empties they sit `under`, by `allBut` (every mesh except those under
the listed empties), by `minZ` (meshes whose lowest point is at least that many tiles up, after placing) or by
`box` (a list of boxes, each `x`, `y` ranges and `minZ`, in tiles after placing): every mesh is first split into
its loose parts, and a part whose centre lies in a box goes to the turret. `box` is for a model whose meshes are merged by material,
so turret and hull share them.

A model's optional `exclude` lists meshes to delete before rendering (e.g. add-on slat armour that hides the
silhouette). `tint` multiplies the textured paint by `color` (minus materials named in `skip`; `overrides` gives a
material its own `color` and `specular`), for a model painted in the wrong colour.

`pose` freezes a rigged model at one frame of one of its animations (`action`, `frame`), e.g. a soldier crouched
and aiming instead of in a T-pose. `copies` places the placed model several times (`x`, `y` in tiles, `turnDeg`
clockwise), e.g. a rifle team. `base` (towers, issue #314) builds our own dug-in pad under the model: a dirt disc
of `radiusTiles` ringed by sandbags, open at the front when `gapDeg` is set, so a dark tower reads on grass at
48 px. The base is part of the hull layer and casts its own shadow.

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


def is_under(obj, names: set) -> bool:
    while obj is not None:
        if obj.name in names:
            return True
        obj = obj.parent
    return False


def is_turret(obj, rule: dict) -> bool:
    if obj.name in rule.get("names", []):
        return True
    if "allBut" in rule:
        return not is_under(obj, set(rule["allBut"]))
    if "box" in rule:
        lo, hi = world_bounds([obj])
        c = (lo + hi) / 2
        return any(
            b["x"][0] <= c.x <= b["x"][1] and b["y"][0] <= c.y <= b["y"][1] and c.z >= b["minZ"] for b in rule["box"]
        )
    if "minZ" in rule:
        return world_bounds([obj])[0].z >= rule["minZ"]
    return is_under(obj.parent, set(rule.get("under", [])))


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


def split_loose_parts() -> None:
    """Split every mesh into its loose parts, so a turret merged into the hull's meshes can be picked by place."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


def apply_pose(pose: dict) -> None:
    """Freeze every armature at `frame` of the animation `action`, then bake the meshes in that pose."""
    action = bpy.data.actions[pose["action"]]
    for arm in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
        arm.animation_data_create().action = action
        if hasattr(arm.animation_data, "action_slot") and action.slots:
            arm.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(pose["frame"])
    bpy.context.view_layer.update()
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        if not any(m.type == "ARMATURE" for m in o.modifiers):
            continue
        bpy.context.view_layer.objects.active = o
        for m in [m for m in o.modifiers if m.type == "ARMATURE"]:
            bpy.ops.object.modifier_apply(modifier=m.name)


def make_copies(copies: list[dict]) -> None:
    """Replace the placed model by one copy per entry, moved `x`, `y` tiles and turned `turnDeg` clockwise."""
    roots = [o for o in bpy.data.objects if o.parent is None]
    originals = [o for o in bpy.data.objects]
    for i, c in enumerate(copies):
        move = Matrix.Translation((c.get("x", 0), c.get("y", 0), 0)) @ Matrix.Rotation(
            -math.radians(c.get("turnDeg", 0)), 4, "Z"
        )
        if i == len(copies) - 1:
            for o in roots:
                o.matrix_world = move @ o.matrix_world
            break
        dupes = {}
        for o in originals:
            d = o.copy()
            if o.data is not None:
                d.data = o.data.copy()
            for col in o.users_collection:
                col.objects.link(d)
            dupes[o] = d
        for o, d in dupes.items():
            if o.parent in dupes:
                d.parent = dupes[o.parent]
        for o in roots:
            dupes[o].matrix_world = move @ o.matrix_world
    bpy.context.view_layer.update()


def flat_material(name: str, color: list[float], roughness: float = 0.95) -> object:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    return mat


def build_base(base: dict) -> list:
    """A dug-in pad of packed earth ringed by sandbags (our own geometry). Returns its objects."""
    radius = base["radiusTiles"]
    gap = math.radians(base.get("gapDeg", 0))
    dirt = flat_material("BaseDirt", base.get("dirtColor", [0.33, 0.27, 0.19]))
    bag = flat_material("BaseSandbag", base.get("bagColor", [0.55, 0.49, 0.35]))
    objs = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=0.02, location=(0, 0, 0.002))
    pad = bpy.context.active_object
    pad.name = "BasePad"
    pad.data.materials.append(dirt)
    objs.append(pad)
    bag_len = base.get("bagTiles", 0.11)
    ring = radius + bag_len * 0.25
    for row, (z, offset) in enumerate(((0.025, 0.0), (0.06, 0.5))):
        count = max(6, round(2 * math.pi * ring / bag_len))
        for i in range(count):
            a = (i + offset) / count * 2 * math.pi  # 0 = north (the front), clockwise
            if gap and min(a, 2 * math.pi - a) < gap / 2:
                continue
            x, y = ring * math.sin(a), ring * math.cos(a)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.5, location=(x, y, z))
            sb = bpy.context.active_object
            sb.name = f"BaseSandbag{row}_{i}"
            sb.scale = (bag_len * 0.5, bag_len * 0.3, bag_len * 0.22)  # long side along the ring
            sb.rotation_euler = (0, 0, -a)
            sb.data.materials.append(bag)
            bpy.ops.object.shade_smooth()
            objs.append(sb)
    bpy.context.view_layer.update()
    return objs


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
    if "pose" in spec:
        apply_pose(spec["pose"])
    place_model(spec)
    if "copies" in spec:
        make_copies(spec["copies"])
    if "box" in spec.get("turret", {}):
        split_loose_parts()
    model = [o for o in bpy.data.objects if o.type == "MESH"]
    turret = [o for o in model if "turret" in spec and is_turret(o, spec["turret"])]
    if "turret" in spec and not turret:
        sys.exit(f"{spec['id']}: the turret rule matched no mesh")
    base = build_base(spec["base"]) if "base" in spec else []
    ground = build_stage(cfg, spec)
    meshes = model + base
    hull = [o for o in meshes if o not in turret]
    out = out / f"render-{spec['id']}"
    out.mkdir(parents=True, exist_ok=True)

    def show(objs, with_ground):
        for o in meshes:
            o.hide_render = o not in objs
        ground.hide_render = not with_ground

    show(meshes, True)
    render(out / f"{spec['id']}.png", cfg)
    if not turret:
        return
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
