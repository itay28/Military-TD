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

`--turntable` (issue #407) renders the same model, materials, tint, base and lighting rig instead as a turntable
for the Field manual: the whole model (turret on it) with its ground shadow, seen from TURNTABLE["elevationDeg"]
up by an orthographic camera that orbits it clockwise in TURNTABLE["stepDeg"] steps, frame 0 looking at its front.
The sun stays put, as in the game. The frames go into one WebP sheet (TURNTABLE["columns"] wide, read left to
right, top to bottom), lossy with alpha, its quality stepped down until it fits TURNTABLE["budgetBytes"]:
  <id>-turntable.webp   the sheet
  <id>-turntable.json   id, kind, faction, frames, frameSize, columns, rows, elevationDeg, stepDeg

`turret` picks meshes by `names`, by the empties they sit `under`, by `allBut` (every mesh except those under
the listed empties), by `minZ` (meshes whose lowest point is at least that many tiles up, after placing) or by
`box` (a list of boxes, each `x`, `y` ranges and `minZ`, in tiles after placing): every mesh is first split into
its loose parts, and a part whose centre lies in a box goes to the turret. `box` is for a model whose meshes are merged by material,
so turret and hull share them. A turret modelled traversed off the front is turned back with `turnDeg` (clockwise,
seen from above) about the centre of the `pivot` mesh (the turret ring), after placing.

A model's optional `exclude` lists meshes to delete before rendering (e.g. add-on slat armour that hides the
silhouette); `excludeMaterials` deletes every mesh whose materials are all in its list (e.g. a diorama's ground and
grass, #509). `tint` multiplies the textured paint by `color` (minus materials named in `skip`; `overrides` gives a
material its own `color` and `specular`), for a model painted in the wrong colour.

`paintOver` (no national insignia on enemy units, ADR-0009 point 4) repaints markings baked into a texture: for
each material named, the strongly coloured texels (HSV saturation above `minSaturation`, default 0.35) inside each of
its `boxes` (`[u0, v0, u1, v1]` in image fractions, from the top-left) take the median colour of the box's other
texels, the plain paint around them. `dropFaces` deletes the faces of mesh `mesh` whose base-colour texel (at the
face's mean UV) is within `within` (default 0.03 per channel) of one of `colors`: markings modelled as decal geometry
on a palette texture.

`sun` (optional) overrides keys of the global sun for one model: soldiers use a higher sun so the shadow stays short
(issue #342). The global `alphaFloor` zeroes the faint alpha the shadow catcher leaves over the whole ground plane
(sky occlusion), so a sprite has no baked haze and its frame can be cropped to the figure. It applies to every model:
only the soldier sets were re-rendered for #342, so re-rendering a vehicle or tower changes its alpha the same way.

`opaque` (true) sets every material of a model to alpha 1, for one exported fully transparent (alpha 0).

`turnDeg` turns a model clockwise after `frontAxis`, for one set down at an angle (not along an axis).

`liftTiles` raises the placed model that far above the ground, so its shadow falls off to the south-east, away from
the sun: an aircraft in flight (the Fighter jet, #482). Without it the model stands on the ground.

`pose` freezes a rigged model at one frame of one of its animations (`action`, `frame`), e.g. a soldier crouched
and aiming instead of in a T-pose. `copies` places the placed model several times (`x`, `y` in tiles, `turnDeg`
clockwise), e.g. a rifle team. `base` (towers, issue #314) builds our own dug-in pad under the model: a dirt disc
of `radiusTiles` ringed by sandbags, open at the front when `gapDeg` is set, so a dark tower reads on grass at
48 px. The base is part of the hull layer and casts its own shadow.

`parts` (issue #464) builds one sprite from several models, e.g. a launcher with no mount, a tripod and a crew: each
entry is another Sketchfab model (`sketchfab`, `author`, `license`, credited like the main one) imported into the same
scene and placed on its own, with the same `frontAxis`, `turnDeg`, `lengthTiles`, `liftTiles`, `exclude`, `tint`,
`untexturedColor`, `opaque`, `pose` and `copies` keys (copies also take `z`). A part with `"turret": true` goes on the turret
layer (the gunner), the others on the hull. `liftTiles` stands a model (main or part) that many tiles up, e.g. a
launcher on its tripod's head.

Setup:  python3.11 -m venv .venv-art && .venv-art/bin/pip install bpy==5.0.1 pillow
Run:    .venv-art/bin/python scripts/render-sprite.py [--only <id>] [--out assets] [--turntable]
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
TURNTABLE = {"frames": 24, "frameSize": 384, "columns": 6, "elevationDeg": 30, "budgetBytes": 300_000, "samples": 32, "alphaFloor": 8}
TURNTABLE["stepDeg"] = 360 / TURNTABLE["frames"]
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
    """The world-space box around the meshes' evaluated vertices, as rendered. Not `bound_box`, which can be stale
    after import (the China Heavy tank's track mesh claims a box a tile taller than its vertices, #509), and not the
    raw vertices, which miss shape keys and modifiers (the Insurgents Heavy tank's barrel)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    pts = []
    for m in meshes:
        ev = m.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in mesh.vertices]
        ev.to_mesh_clear()
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def tint_untextured(color: list[float], mats=None) -> None:
    """Give materials that lost their texture (plain base colour, no image) `color`, so they don't render white."""
    for mat in bpy.data.materials if mats is None else mats:
        bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
        if bsdf and not bsdf.inputs["Base Color"].links:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)


def make_opaque(mats=None) -> None:
    """Set every material's alpha to 1, for a model exported with alpha 0 (it renders see-through, as on its
    Sketchfab page)."""
    for mat in bpy.data.materials if mats is None else mats:
        bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
        if bsdf and not bsdf.inputs["Alpha"].links:
            bsdf.inputs["Alpha"].default_value = 1.0


def tint_paint(color: list[float], skip: list[str], overrides: dict[str, dict], mats=None) -> None:
    """Multiply every textured base colour by `color` (a grey-painted model turned olive).

    `skip` keeps materials whose name starts with an entry. `overrides` gives a material (by name prefix) its own
    `color` and, optionally, `specular` (Principled "Specular IOR Level"), for a part that renders lighter than
    the rest: a pale texture, or flat tops mirroring the sky. An override with `"flat": true` on an untextured
    material (a flat base colour) sets that colour (and `specular`) instead, for a low-poly model painted in plain
    colours; without it, untextured materials are left alone.
    """
    for mat in bpy.data.materials if mats is None else mats:
        tree = mat.node_tree
        bsdf = tree.nodes.get("Principled BSDF") if tree else None
        if not bsdf or any(mat.name.startswith(s) for s in skip):
            continue
        own = next((o for prefix, o in overrides.items() if mat.name.startswith(prefix)), {})
        flat = not bsdf.inputs["Base Color"].links
        if flat and not own.get("flat"):
            continue
        if "specular" in own:
            bsdf.inputs["Specular IOR Level"].default_value = own["specular"]
        if flat:
            if "color" in own:
                bsdf.inputs["Base Color"].default_value = (*own["color"], 1.0)
            continue
        link = bsdf.inputs["Base Color"].links[0]
        mix = tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = (*own.get("color", color), 1.0)
        tree.links.new(link.from_socket, mix.inputs["A"])
        tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


def base_image(mat) -> object:
    """The image that feeds a material's base colour, or None."""
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if not bsdf or not bsdf.inputs["Base Color"].links:
        return None
    node = bsdf.inputs["Base Color"].links[0].from_node
    return node.image if node.type == "TEX_IMAGE" else None


def paint_over(rules: dict[str, dict]) -> None:
    """Repaint the strongly coloured texels (markings) in each box with the box's median plain paint (`paintOver`)."""
    import numpy as np

    for name, rule in rules.items():
        img = base_image(bpy.data.materials[name])
        if img is None:
            sys.exit(f"paintOver: material {name} has no base-colour image")
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)  # Blender stores rows bottom-up
        for u0, v0, u1, v1 in rule["boxes"]:
            rows = slice(h - round(v1 * h), h - round(v0 * h))
            cols = slice(round(u0 * w), round(u1 * w))
            box = px[rows, cols, :3]
            hi, lo = box.max(axis=2), box.min(axis=2)
            marked = (hi - lo) / np.maximum(hi, 1e-6) > rule.get("minSaturation", 0.35)
            if marked.all():
                sys.exit(f"paintOver: box {[u0, v0, u1, v1]} of {name} has no plain paint")
            box[marked] = np.median(box[~marked], axis=0)
            px[rows, cols, :3] = box
        img.pixels.foreach_set(px.ravel())
        img.update()
        img.pack()


def drop_faces(rules: list[dict]) -> None:
    """Delete the faces whose base-colour texel matches one of `colors` (`dropFaces`): decal geometry."""
    import bmesh

    for rule in rules:
        obj = bpy.data.objects[rule["mesh"]]
        img = base_image(obj.data.materials[0])
        w, h = img.size
        px = list(img.pixels)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        uv = bm.loops.layers.uv.active
        tol = rule.get("within", 0.03)
        doomed = []
        for f in bm.faces:
            u = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
            v = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
            i = (min(h - 1, max(0, int(v % 1 * h))) * w + min(w - 1, max(0, int(u % 1 * w)))) * 4
            c = px[i : i + 3]
            if any(all(abs(c[k] - col[k]) <= tol for k in range(3)) for col in rule["colors"]):
                doomed.append(f)
        if not doomed:
            sys.exit(f"dropFaces: no face of {rule['mesh']} matched")
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
        print(f"dropFaces: {rule['mesh']}: deleted {len(doomed)} faces")


def place_model(spec: dict, objs=None) -> None:
    """Turn the model's front north (`frontAxis`, then `turnDeg` clockwise), stand it on z = 0, scale it so its
    north-south length is `lengthTiles`, then raise it `liftTiles` (default 0). `objs` limits it to one import (a part).

    One Blender unit is one tile from here on.
    """
    objs = list(bpy.data.objects) if objs is None else objs
    meshes = [o for o in objs if o.type == "MESH"]
    turn = Matrix.Rotation(FRONT[spec["frontAxis"]] - math.radians(spec.get("turnDeg", 0)), 4, "Z")
    roots = [o for o in objs if o.parent is None]
    for o in roots:
        o.matrix_world = turn @ o.matrix_world
    bpy.context.view_layer.update()
    fit_model(spec)


def fit_model(spec: dict) -> None:
    """Scale the model so its north-south length is `lengthTiles` and centre it on the origin, standing on z = 0."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    roots = [o for o in bpy.data.objects if o.parent is None]
    lo, hi = world_bounds(meshes)
    scale = spec["lengthTiles"] / (hi.y - lo.y)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    fit = Matrix.Translation((0, 0, spec.get("liftTiles", 0))) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)
    for o in roots:
        o.matrix_world = fit @ o.matrix_world
    bpy.context.view_layer.update()


def turn_turret(turret: list, deg: float, pivot) -> None:
    """Turn the turret meshes `deg` clockwise (seen from above) about the centre of the `pivot` mesh."""
    lo, hi = world_bounds([pivot])
    c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    turn = Matrix.Translation(c) @ Matrix.Rotation(-math.radians(deg), 4, "Z") @ Matrix.Translation(-c)
    for o in turret:
        o.matrix_world = turn @ o.matrix_world
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


def apply_pose(pose: dict, objs=None, actions=None) -> None:
    """Freeze every armature at `frame` of the animation `action`, then bake the meshes in that pose.

    `objs` and `actions` limit it to one import (a part), whose action names Blender may have suffixed."""
    objs = list(bpy.data.objects) if objs is None else objs
    pool = bpy.data.actions if actions is None else actions
    action = next((a for a in pool if a.name.split(".")[0] == pose["action"]), None)
    if action is None:
        sys.exit(f"pose action {pose['action']!r} not found (have: {sorted({a.name.split('.')[0] for a in pool})})")
    for arm in [o for o in objs if o.type == "ARMATURE"]:
        arm.animation_data_create().action = action
        if hasattr(arm.animation_data, "action_slot") and action.slots:
            arm.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(pose["frame"])
    bpy.context.view_layer.update()
    for o in [o for o in objs if o.type == "MESH"]:
        if not any(m.type == "ARMATURE" for m in o.modifiers):
            continue
        bpy.context.view_layer.objects.active = o
        for m in [m for m in o.modifiers if m.type == "ARMATURE"]:
            bpy.ops.object.modifier_apply(modifier=m.name)


def make_copies(copies: list[dict], objs=None) -> list:
    """Replace the placed model by one copy per entry, moved `x`, `y`, `z` tiles and turned `turnDeg` clockwise.

    `objs` limits it to one import (a part). Returns every object of the copies."""
    originals = list(bpy.data.objects) if objs is None else list(objs)
    roots = [o for o in originals if o.parent is None]
    made = list(originals)
    for i, c in enumerate(copies):
        move = Matrix.Translation((c.get("x", 0), c.get("y", 0), c.get("z", 0))) @ Matrix.Rotation(
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
        made += dupes.values()
        for o, d in dupes.items():
            if o.parent in dupes:
                d.parent = dupes[o.parent]
        for o in roots:
            dupes[o].matrix_world = move @ o.matrix_world
    bpy.context.view_layer.update()
    return made


def add_part(part: dict, cache: Path) -> list:
    """Import one extra model (`parts`) into the scene and place it on its own: posed, tinted, placed, copied.

    Only the objects, materials and actions this import added are touched. Returns its meshes."""
    before = (set(bpy.data.objects), set(bpy.data.materials), set(bpy.data.actions))
    bpy.ops.import_scene.gltf(filepath=str(download(part["sketchfab"], cache)))
    objs = [o for o in bpy.data.objects if o not in before[0]]
    mats = [m for m in bpy.data.materials if m not in before[1]]
    actions = [a for a in bpy.data.actions if a not in before[2]]
    for name in part.get("exclude", []):
        hit = next(o for o in objs if o.name.split(".")[0] == name or o.name == name)
        objs.remove(hit)
        bpy.data.objects.remove(hit, do_unlink=True)
    if "tint" in part:
        t = part["tint"]
        tint_paint(t["color"], t.get("skip", []), t.get("overrides", {}), mats)
    if "untexturedColor" in part:
        tint_untextured(part["untexturedColor"], mats)
    if part.get("opaque"):
        make_opaque(mats)
    if "pose" in part:
        apply_pose(part["pose"], objs, actions)
    place_model(part, objs)
    objs = make_copies(part.get("copies", [{}]), objs)
    return [o for o in objs if o.type == "MESH"]


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

    sun_cfg = {**cfg["sun"], **spec.get("sun", {})}
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


def desaturate(path: Path, amount: float, alpha_floor: float) -> None:
    """Mix each pixel's colour `amount` of the way to its grey (Rec. 709 luma); alpha at or below `alpha_floor`
    (0..1) becomes 0 (the shadow catcher's ground-wide haze), the rest is untouched."""
    img = bpy.data.images.load(str(path))
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        r, g, b = px[i], px[i + 1], px[i + 2]
        y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        px[i], px[i + 1], px[i + 2] = r + (y - r) * amount, g + (y - g) * amount, b + (y - b) * amount
        if px[i + 3] <= alpha_floor:
            px[i + 3] = 0.0
    img.pixels = px
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def render(path: Path, cfg: dict) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    desaturate(path, cfg["desaturate"], cfg.get("alphaFloor", 0))
    print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


def prepare_model(spec: dict, cache: Path) -> tuple[list, list, list]:
    """Import, clean, tint, pose, place and copy the model and its parts, and build its base.

    Returns (model, turret, base)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(download(spec["sketchfab"], cache)))
    for name in spec.get("exclude", []):
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    drop = set(spec.get("excludeMaterials", []))
    for o in [o for o in bpy.data.objects if o.type == "MESH" and drop]:
        mats = {slot.material.name for slot in o.material_slots if slot.material}
        if mats and mats <= drop:
            bpy.data.objects.remove(o, do_unlink=True)
    if "paintOver" in spec:
        paint_over(spec["paintOver"])
    if "dropFaces" in spec:
        drop_faces(spec["dropFaces"])
    if "tint" in spec:
        tint_paint(spec["tint"]["color"], spec["tint"].get("skip", []), spec["tint"].get("overrides", {}))
    if "untexturedColor" in spec:
        tint_untextured(spec["untexturedColor"])
    if spec.get("opaque"):
        make_opaque()
    if "pose" in spec:
        apply_pose(spec["pose"])
    place_model(spec)
    if "copies" in spec:
        make_copies(spec["copies"])
    if "box" in spec.get("turret", {}):
        split_loose_parts()
    model = [o for o in bpy.data.objects if o.type == "MESH"]
    turret = [o for o in model if "turret" in spec and is_turret(o, spec["turret"])]
    for part in spec.get("parts", []):
        meshes = add_part(part, cache)
        model += meshes
        turret += meshes if part.get("turret") else []
    if "turret" in spec and not turret:
        sys.exit(f"{spec['id']}: the turret rule matched no mesh")
    if "turnDeg" in spec.get("turret", {}):
        turn_turret(turret, spec["turret"]["turnDeg"], bpy.data.objects[spec["turret"]["pivot"]])
        fit_model(spec)  # placed with the turret askew: fit the length and centre again with it turned
    base = build_base(spec["base"]) if "base" in spec else []
    return model, turret, base


def render_model(cfg: dict, spec: dict, cache: Path, out: Path) -> None:
    model, turret, base = prepare_model(spec, cache)
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


def orbit_frame(meshes, cfg: dict, spec: dict) -> tuple[Vector, float]:
    """The point the turntable camera orbits and the orthographic scale that keeps the model and its ground shadow
    in frame from every side: every vertex, and where its shadow falls, projected for each frame's view."""
    import numpy as np

    lo, hi = world_bounds(meshes)
    centre = (lo + hi) / 2
    pts = []
    for m in meshes:
        co = np.empty(len(m.data.vertices) * 3, dtype=np.float64)
        m.data.vertices.foreach_get("co", co)
        co = np.c_[co.reshape(-1, 3), np.ones(len(co) // 3)] @ np.array(m.matrix_world).T
        pts.append(co[:, :3])
    pts = np.concatenate(pts)
    sun = {**cfg["sun"], **spec.get("sun", {})}  # as build_stage lights it
    el, az = math.radians(sun["elevationDeg"]), math.radians(sun["azimuthDeg"])
    away = np.array((-math.sin(az), -math.cos(az), 0.0))  # shadows fall away from the sun's azimuth
    shadows = pts * (1, 1, 0) + np.outer(np.maximum(pts[:, 2], 0) / math.tan(el), away)
    pts = np.concatenate([pts, shadows]) - np.array(centre)
    cam_el = math.radians(TURNTABLE["elevationDeg"])
    reach = 0.0
    for i in range(TURNTABLE["frames"]):
        a = math.radians(i * TURNTABLE["stepDeg"])
        right = np.array((-math.cos(a), math.sin(a), 0.0))  # screen axes of a camera at bearing a, looking at centre
        up = np.cross(np.array((math.sin(a) * math.cos(cam_el), math.cos(a) * math.cos(cam_el), math.sin(cam_el))), right)
        reach = max(reach, np.abs(pts @ right).max(), np.abs(pts @ up).max())
    return centre, 2 * reach * 1.04


def frame_png(path: Path) -> object:
    from PIL import Image

    with Image.open(path) as img:
        return img.convert("RGBA").copy()


def desaturated(img, amount: float) -> object:
    """`img` with each pixel's colour mixed `amount` of the way to its grey (Rec. 709 luma), as desaturate() does,
    and the near-transparent noise around the shadow cleared (it would double the WebP's size)."""
    import numpy as np
    from PIL import Image

    px = np.asarray(img, dtype=np.float32)
    y = px[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    px[..., :3] += (y[..., None] - px[..., :3]) * amount
    px[px[..., 3] < TURNTABLE["alphaFloor"]] = 0  # the shadow catcher's faint sky-light noise: clear, not 1-7/255
    return Image.fromarray(np.clip(px + 0.5, 0, 255).astype(np.uint8), "RGBA")


def save_sheet(frames: list, path: Path) -> int:
    """Tile `frames` into one sheet and save it as WebP at the best quality under the budget. Returns the size."""
    from PIL import Image

    size, cols = TURNTABLE["frameSize"], TURNTABLE["columns"]
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (cols * size, rows * size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * size, (i // cols) * size))
    for quality in range(90, 19, -5):  # alpha at 50: the alpha plane is most of the bytes, and 50 looks the same
        sheet.save(path, "WEBP", quality=quality, alpha_quality=50, method=6)
        if path.stat().st_size <= TURNTABLE["budgetBytes"]:
            return path.stat().st_size
    sys.exit(f"{path.name}: over {TURNTABLE['budgetBytes']} bytes even at quality 20")


def render_turntable(cfg: dict, spec: dict, cache: Path, out: Path) -> None:
    model, _, base = prepare_model(spec, cache)
    meshes = model + base
    build_stage(cfg, spec)
    scene = bpy.context.scene
    size = TURNTABLE["frameSize"]
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.cycles.samples = cfg.get("samples", TURNTABLE["samples"])  # 24 frames: denoised 32 is plenty at 384 px
    centre, scale = orbit_frame(meshes, cfg, spec)
    cam = scene.camera
    cam.data.ortho_scale = scale
    cam.data.clip_end = 100
    el = math.radians(TURNTABLE["elevationDeg"])
    frames = []
    tmp = cache.parent / "turntable-frames" / spec["id"]  # kept, so the sheet can be re-encoded without rendering
    tmp.mkdir(parents=True, exist_ok=True)
    for i in range(TURNTABLE["frames"]):
        az = math.radians(i * TURNTABLE["stepDeg"])  # compass bearing from the model: 0 = its front (north)
        cam.location = centre + 20 * Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(tmp / f"{i:02}.png")
        bpy.ops.render.render(write_still=True)
        frames.append(desaturated(frame_png(Path(scene.render.filepath)), cfg["desaturate"]))
    folder = out / f"render-{spec['id']}"
    folder.mkdir(parents=True, exist_ok=True)
    sheet = folder / f"{spec['id']}-turntable.webp"
    nbytes = save_sheet(frames, sheet)
    meta = {
        "id": spec["id"],
        "kind": spec["kind"],
        "faction": spec["faction"],
        "frames": TURNTABLE["frames"],
        "frameSize": size,
        "columns": TURNTABLE["columns"],
        "rows": math.ceil(TURNTABLE["frames"] / TURNTABLE["columns"]),
        "elevationDeg": TURNTABLE["elevationDeg"],
        "stepDeg": TURNTABLE["stepDeg"],
    }
    (folder / f"{spec['id']}-turntable.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {sheet.relative_to(ROOT) if sheet.is_relative_to(ROOT) else sheet} ({nbytes} bytes)")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=ROOT / "scripts/render-sprite.json", type=Path)
    ap.add_argument("--out", default=ROOT / "assets", type=Path)
    ap.add_argument("--cache", default=ROOT / ".cache/models", type=Path)
    ap.add_argument("--only", help="render just this model id")
    ap.add_argument("--samples", type=int, help="Cycles samples (default 64)")
    ap.add_argument("--turntable", action="store_true", help="render the turntable sheet instead of the sprites")
    args = ap.parse_args(argv)
    cfg = json.loads(args.config.read_text())
    if args.samples:
        cfg["samples"] = args.samples
    for spec in cfg["models"]:
        if args.only in (None, spec["id"]):
            (render_turntable if args.turntable else render_model)(cfg, spec, args.cache, args.out)


if __name__ == "__main__":
    main()
