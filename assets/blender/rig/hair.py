"""Hair and beard attachments.

Authored in head-local space: origin = skull center, -Y = face. The client
parents the chosen mesh to the head bone's transform node with a per-race
offset (packages/content appearance data). All style x color variants are
exported in ONE hair.glb; the client clones only the mesh it needs.

Styles: short, long, pony (+ bald = nothing). Beards: short, full.
Colors ride palette rows: grip(black) wood(brown) gold(blonde) copper(red) stone(grey).
"""
import math

import bmesh
import bpy
from mathutils import Vector

try:
    import common
except ImportError:
    from generators import common

COLORS = {
    "black": ("grip", 0.3),
    "brown": ("wood", 0.45),
    "blonde": ("gold", 0.7),
    "red": ("copper", 0.55),
    "grey": ("stone", 0.7),
}

R = 0.115  # canonical skull radius


def _blob(bm, center, radius, squash, jitter, rng, subdiv=1):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    verts = res["verts"]
    for v in verts:
        n = v.co.normalized()
        v.co += n * rng.uniform(-jitter, jitter) * radius
        v.co.z *= squash
        v.co += Vector(center)
    return [f for f in bm.faces if any(v in verts for v in f.verts)]


def _drape(bm, x, y0, y1, z0, z1, w, th):
    """A hanging slab of hair (back drape / ponytail / beard fall)."""
    faces = common.add_box(bm, (x, (y0 + y1) / 2, (z0 + z1) / 2), (w, abs(y1 - y0) + th, abs(z1 - z0)))
    return faces


def hair(style: str, color: str, seed: int = 3):
    rng = common.rng(seed, "hair", style, color)
    row, t = COLORS[color]
    bm = bmesh.new()
    # cap: covers the top/back of the skull, leaves the face open
    faces = _blob(bm, (0, 0.012, 0.035), R * 1.12, 0.78, 0.12, rng)
    common.paint_faces(bm, faces, row, t)
    # fringe
    f2 = common.add_box(bm, (0, -R * 0.82, 0.075), (R * 1.5, 0.03, 0.05))
    common.paint_faces(bm, f2, row, t - 0.08)
    if style == "long":
        f3 = _drape(bm, 0, R * 0.7, R * 1.0, -0.26, 0.05, R * 1.7, 0.02)
        common.paint_faces(bm, f3, row, t - 0.05)
        for sx in (-1, 1):  # side falls
            f4 = _drape(bm, sx * R * 0.95, 0.0, 0.05, -0.18, 0.04, 0.035, 0.05)
            common.paint_faces(bm, f4, row, t - 0.1)
    elif style == "pony":
        rings = []
        for i, (back, z, r) in enumerate(((0.10, 0.07, 0.035), (0.17, -0.02, 0.028), (0.21, -0.14, 0.018))):
            ring = [bm.verts.new((r * math.cos(a) , R * 0.9 + back + r * math.sin(a) * 0.4, z)) for a in
                    [k * math.tau / 6 for k in range(6)]]
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            fs = [bm.faces.new((a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i])) for i in range(6)]
            common.paint_faces(bm, fs, row, t - 0.05)
        cap0 = bm.faces.new(tuple(reversed(rings[0])))
        cap1 = bm.faces.new(tuple(rings[-1]))
        common.paint_faces(bm, [cap0, cap1], row, t - 0.1)
    name = f"hair_{style}_{color}"
    return _finish(name, bm)


def beard(style: str, color: str, seed: int = 5):
    rng = common.rng(seed, "beard", style, color)
    row, t = COLORS[color]
    bm = bmesh.new()
    # jaw wrap
    faces = _blob(bm, (0, -R * 0.55, -0.065), R * 0.85, 0.55, 0.18, rng)
    common.paint_faces(bm, faces, row, t)
    if style == "full":
        f2 = _drape(bm, 0, -R * 0.78, -R * 0.5, -0.24, -0.06, R * 1.15, 0.02)
        common.paint_faces(bm, f2, row, t - 0.06)
    name = f"beard_{style}_{color}"
    return _finish(name, bm)


def _finish(name, bm):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    return common.finish_object(name, bm, smooth=True)


def build_all():
    objs = []
    for style in ("short", "long", "pony"):
        for color in COLORS:
            objs.append(hair(style, color))
    for style in ("short", "full"):
        for color in COLORS:
            objs.append(beard(style, color))
    return objs


def export_library(objs):
    """All variants into one GLB."""
    import os

    import export as exp

    out_dir = os.path.join(common.repo_root(), "assets", "out", "characters")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "hair.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    return path
