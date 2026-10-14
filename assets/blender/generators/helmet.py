"""Helmets, authored in head-local space like hair (origin = skull center,
-Y = face). One per tier; the client swaps them onto the head bone.
"""
import math

import bmesh
import bpy

try:
    import common
except ImportError:
    from . import common

R = 0.125  # a touch over the skull

TIERS = ["copper", "iron", "steel", "mithril", "adamant", "runic"]


def helm(tier: str):
    bm = bmesh.new()
    n = 8
    # dome: stacked rings closing to a crown point
    rings = []
    for frac, zz in ((1.0, -0.02), (0.96, 0.05), (0.8, 0.11), (0.5, 0.155)):
        rings.append([
            bm.verts.new((R * frac * math.cos(a), R * frac * math.sin(a) * 1.05, zz))
            for a in [k * math.tau / n for k in range(n)]
        ])
    faces = []
    for a, b in zip(rings, rings[1:]):
        faces += [bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
    crown = bm.verts.new((0, 0, 0.185))
    faces += [bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], crown)) for i in range(n)]
    common.paint_faces(bm, faces, tier, 0.6)

    # brow rim
    rim = []
    for frac, zz in ((1.08, -0.035), (1.08, 0.005)):
        rim.append([
            bm.verts.new((R * frac * math.cos(a), R * frac * math.sin(a) * 1.05, zz))
            for a in [k * math.tau / n for k in range(n)]
        ])
    rimf = [bm.faces.new((rim[0][i], rim[0][(i + 1) % n], rim[1][(i + 1) % n], rim[1][i])) for i in range(n)]
    rimf.append(bm.faces.new(tuple(reversed(rim[0]))))
    common.paint_faces(bm, rimf, tier, 0.4)

    # nose guard
    ng = common.add_box(bm, (0, -R * 1.02, -0.055), (0.03, 0.025, 0.09))
    common.paint_faces(bm, ng, tier, 0.45)

    name = f"helm_{tier}"
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    return common.finish_object(name, bm)


def build_all(export=True):
    import export as exp

    objs = []
    for t in TIERS:
        o = helm(t)
        objs.append(o)
        if export:
            exp.export_glb(o, "gear", f"helm_{t}")
    return objs
