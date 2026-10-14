"""Sculpted heads for the player races.

Each head is a UV sphere hand-sculpted by the same pass structure proven on
the test head (block-in -> features -> polish -> symmetrize), parameterized
by race and sex. Eyes/lips are painted by face-proximity onto the sculpt.
Deterministic: same params -> same head.
"""
import math

import bmesh
import bpy
from mathutils import Vector

try:
    import common
    import sculpt as sc
except ImportError:
    from generators import common
    import sculpt as sc


def head_params(race: str, sex: str) -> dict:
    d = dict(brow=1.0, jaw=1.0, chin=1.0, nose=1.0, cheek=1.0, width=1.0, skull=1.0)
    if race == "elf":
        d.update(width=0.92, cheek=1.35, nose=0.8, chin=0.9, brow=0.85, skull=1.05)
    elif race == "dwarf":
        d.update(width=1.14, nose=1.55, brow=1.5, jaw=1.25, chin=1.1, skull=0.95)
    if sex == "f":
        d["brow"] *= 0.55
        d["jaw"] *= 0.85
        d["chin"] *= 0.8
        d["cheek"] *= 1.25
        d["nose"] *= 0.85
    else:
        d["jaw"] *= 1.1
    return d


def paint_near(bm, uv_layer, point, radius, row, t):
    """Paint faces whose center lies near a feature point (and its X-mirror)."""
    uv = common.uv_point(row, t)
    pts = [Vector(point)]
    if abs(point[0]) > 1e-6:
        pts.append(Vector((-point[0], point[1], point[2])))
    for c in pts:
        for f in bm.faces:
            if (f.calc_center_median() - c).length < radius:
                for loop in f.loops:
                    loop[uv_layer].uv = uv


def build_head_mesh(race: str, sex: str, skin_row: str, skin_t: float, R: float):
    """Returns a bmesh of the sculpted head centered at origin (skull center),
    face toward -Y, ready to be welded into a body part."""
    hp = head_params(race, sex)
    s = R / 0.5  # the proven sculpt pass was authored on a 0.5-radius sphere

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=20, radius=R)
    # squash to head proportions before sculpting
    for v in bm.verts:
        v.co.x *= 0.92 * hp["width"]
        v.co.y *= 1.0

    tmp = bpy.data.meshes.new("_tmp_head")
    bm.to_mesh(tmp)
    bm.free()
    obj = bpy.data.objects.new("_tmp_head", tmp)
    bpy.context.collection.objects.link(obj)

    S = sc.Sculpt.from_object(obj, mirror_x=True)
    def P(x, y, z):
        return (x * s, y * s, z * s)

    # ---- block in ----
    S.grab(center=P(0, 0.05, 0.45), radius=0.45 * s, offset=P(0, 0, 0.10 * hp["skull"]))
    S.inflate(center=P(0, 0.42, 0.12), radius=0.38 * s, amount=0.05 * s)
    S.flatten(center=P(0.48, 0.05, 0.05), radius=0.35 * s, amount=0.5)
    S.grab(center=P(0, -0.28, -0.38), radius=0.38 * s, offset=P(0, -0.06 * hp["jaw"], -0.16 * hp["jaw"]))
    S.pinch(center=P(0, -0.3, -0.52), radius=0.3 * s, amount=0.25 / max(hp["jaw"], 0.6))
    # ---- features ----
    S.inflate(center=P(0.15, -0.40, 0.16), radius=0.17 * s, amount=0.030 * s * hp["brow"])
    S.crease(center=P(0.16, -0.43, 0.06), radius=0.13 * s, depth=0.045 * s)
    S.grab(center=P(0, -0.47, 0.02), radius=0.11 * s, offset=P(0, -0.085 * hp["nose"], -0.015))
    S.pinch(center=P(0, -0.46, 0.10), radius=0.09 * s, amount=0.25)
    S.grab(center=P(0, -0.52, 0.05), radius=0.13 * s, offset=P(0, 0, -0.07))
    S.pinch(center=P(0, -0.55, -0.06), radius=0.08 * s, amount=0.3 / max(hp["nose"], 0.7))
    S.inflate(center=P(0, -0.55, -0.08), radius=0.05 * s, amount=0.015 * s * hp["nose"])
    S.inflate(center=P(0.25, -0.30, -0.02), radius=0.15 * s, amount=0.035 * s * hp["cheek"])
    S.stroke([P(x, -0.465, -0.24) for x in (0.10, 0.05, 0.0)], radius=0.065 * s, brush="crease", depth=0.03 * s)
    S.crease(center=P(0, -0.50, -0.165), radius=0.045 * s, depth=0.02 * s)
    S.inflate(center=P(0, -0.45, -0.29), radius=0.08 * s, amount=0.018 * s)
    S.inflate(center=P(0, -0.44, -0.40), radius=0.10 * s, amount=0.03 * s * hp["chin"])
    if sex == "m":
        S.flatten(center=P(0, -0.42, -0.44), radius=0.12 * s, amount=0.35)
    S.inflate(center=P(0.27, -0.22, -0.24), radius=0.12 * s, amount=0.025 * s * hp["jaw"])
    S.flatten(center=P(0.33, -0.15, 0.22), radius=0.18 * s, amount=0.4)
    # ---- polish ----
    S.smooth(center=P(0, 0.2, 0.2), radius=0.75 * s, iterations=1, lam=0.22)
    S.symmetrize("X")
    S.commit(shade_smooth=True)
    S.free()

    # paint: skin everywhere, dark eyes, lip shade — onto a fresh bmesh
    out = bmesh.new()
    out.from_mesh(obj.data)
    uv_layer = out.loops.layers.uv.verify()
    common.paint_faces(out, out.faces, skin_row, skin_t)
    paint_near(out, uv_layer, P(0.155, -0.455, 0.05), 0.065 * s, "grip", 0.12)   # eyes
    paint_near(out, uv_layer, P(0.15, -0.40, 0.17), 0.05 * s, skin_row, skin_t - 0.1)  # brow shadow
    paint_near(out, uv_layer, P(0, -0.50, -0.24), 0.07 * s, skin_row, skin_t - 0.22)   # lips
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(tmp)
    return out
