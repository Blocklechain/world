"""Monster models — static low-poly meshes (the client animates the root:
bob while moving, lunge on attack, topple on death). Facing -Y, origin at
ground. 150-450 tris each, gear palette only.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector

try:
    import common
except ImportError:
    from generators import common


def _blob(bm, center, radius, squash, rng, jitter=0.22, subdiv=1):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    verts = res["verts"]
    for v in verts:
        n = v.co.normalized()
        v.co += n * rng.uniform(-jitter, jitter) * radius
        v.co.z *= squash
        v.co += Vector(center)
    return [f for f in bm.faces if any(v in verts for v in f.verts)]


def _tube(bm, p0, p1, r0, r1, n=6):
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    up = Vector((0, 0, 1)) if abs(axis.z) < 0.95 else Vector((1, 0, 0))
    bx = axis.cross(up).normalized()
    by = axis.cross(bx).normalized()
    rings = []
    for p, r in ((p0, r0), (p1, r1)):
        rings.append([bm.verts.new(p + bx * (r * math.cos(a)) + by * (r * math.sin(a)))
                      for a in [k * math.tau / n for k in range(n)]])
    faces = [bm.faces.new((rings[0][i], rings[0][(i + 1) % n], rings[1][(i + 1) % n], rings[1][i])) for i in range(n)]
    faces.append(bm.faces.new(tuple(reversed(rings[0]))))
    faces.append(bm.faces.new(tuple(rings[1])))
    return faces


def _finish(name, bm):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    return common.finish_object(name, bm)


def _quadruped(name, rng, body_len, body_r, leg_h, head_r, row, t, tail=True, snout=0.14, ears=0.05):
    bm = bmesh.new()
    z = leg_h + body_r * 0.5
    bf = _blob(bm, (0, body_len * 0.1, z), body_r, 0.85, rng, subdiv=1)
    bf += _blob(bm, (0, -body_len * 0.28, z + 0.02), body_r * 0.85, 0.85, rng)
    common.paint_faces(bm, bf, row, t)
    # head + snout
    hz = z + body_r * 0.5
    hf = _blob(bm, (0, -body_len * 0.52, hz), head_r, 0.9, rng)
    common.paint_faces(bm, hf, row, t + 0.08)
    sf = _tube(bm, (0, -body_len * 0.52, hz - 0.01), (0, -body_len * 0.52 - snout, hz - 0.03), head_r * 0.5, head_r * 0.3)
    common.paint_faces(bm, sf, row, t - 0.05)
    if ears > 0:
        for sx in (-1, 1):
            ef = _tube(bm, (sx * head_r * 0.5, -body_len * 0.48, hz + head_r * 0.6),
                       (sx * head_r * 0.7, -body_len * 0.46, hz + head_r * 0.6 + ears), 0.03, 0.005, n=4)
            common.paint_faces(bm, ef, row, t - 0.1)
    # legs
    for sy in (-0.32, 0.3):
        for sx in (-1, 1):
            lf = _tube(bm, (sx * body_r * 0.55, body_len * sy, z), (sx * body_r * 0.6, body_len * sy, 0), body_r * 0.22, body_r * 0.16)
            common.paint_faces(bm, lf, row, t - 0.12)
    if tail:
        tf = _tube(bm, (0, body_len * 0.42, z + 0.05), (0, body_len * 0.75, z + 0.18), 0.045, 0.012)
        common.paint_faces(bm, tf, row, t - 0.05)
    return _finish(name, bm)


def _biped(name, rng, h, bulk, head_r, body_row, body_t, skin_row, skin_t, hunch=0.0, club=False):
    bm = bmesh.new()
    leg_h = h * 0.42
    torso_h = h * 0.36
    # legs
    for sx in (-1, 1):
        lf = _tube(bm, (sx * 0.09 * bulk, 0, leg_h), (sx * 0.1 * bulk, 0, 0), 0.055 * bulk, 0.04 * bulk)
        common.paint_faces(bm, lf, body_row, body_t - 0.12)
    # torso (hunched: top ring pushed forward)
    tf = _tube(bm, (0, 0, leg_h), (0, -hunch, leg_h + torso_h), 0.13 * bulk, 0.17 * bulk)
    common.paint_faces(bm, tf, body_row, body_t)
    # arms (long, hang toward ground)
    sh_z = leg_h + torso_h * 0.9
    for sx in (-1, 1):
        af = _tube(bm, (sx * 0.19 * bulk, -hunch * 0.8, sh_z), (sx * 0.24 * bulk, -hunch - 0.05, leg_h * 0.55), 0.05 * bulk, 0.045 * bulk)
        common.paint_faces(bm, af, skin_row, skin_t)
    # head
    hf = _blob(bm, (0, -hunch - 0.02, sh_z + head_r * 0.9), head_r, 0.9, rng)
    common.paint_faces(bm, hf, skin_row, skin_t + 0.06)
    # pointy ears for goblinoids
    for sx in (-1, 1):
        ef = _tube(bm, (sx * head_r * 0.8, -hunch, sh_z + head_r * 0.9), (sx * head_r * 1.5, -hunch + 0.03, sh_z + head_r * 1.15), 0.025, 0.004, n=4)
        common.paint_faces(bm, ef, skin_row, skin_t)
    # eyes
    for sx in (-1, 1):
        ef = common.add_box(bm, (sx * head_r * 0.35, -hunch - head_r * 0.85, sh_z + head_r * 0.95), (0.03, 0.015, 0.025))
        common.paint_faces(bm, ef, "grip", 0.1)
    if club:
        cf = _tube(bm, (0.26 * bulk, -hunch - 0.1, leg_h * 0.5), (0.34 * bulk, -hunch - 0.35, leg_h * 1.4), 0.03, 0.07)
        common.paint_faces(bm, cf, "wood", 0.35)
    return _finish(name, bm)


def vermin(seed=31):
    r = common.rng(seed, "vermin")
    o = _quadruped("vermin", r, 0.8, 0.22, 0.12, 0.14, "leather", 0.42, snout=0.12, ears=0.06)
    return o


def wolf(seed=32):
    r = common.rng(seed, "wolf")
    return _quadruped("wolf", r, 1.2, 0.3, 0.42, 0.18, "stone", 0.45, snout=0.2, ears=0.08)


def goblin(seed=33):
    r = common.rng(seed, "goblin")
    return _biped("goblin", r, 1.1, 0.9, 0.14, "leather", 0.35, "adamant", 0.5)


def goblin_brute(seed=34):
    r = common.rng(seed, "goblin_brute")
    return _biped("goblin_brute", r, 1.5, 1.5, 0.16, "iron", 0.4, "adamant", 0.42, hunch=0.12, club=True)


def bandit(seed=35):
    r = common.rng(seed, "bandit")
    o = _biped("bandit", r, 1.7, 1.0, 0.13, "grip", 0.35, "bone", 0.6)
    return o


def skeleton(seed=36):
    r = common.rng(seed, "skeleton")
    return _biped("skeleton", r, 1.7, 0.72, 0.13, "bone", 0.72, "bone", 0.8)


def acolyte(seed=37):
    r = common.rng(seed, "acolyte")
    bm = bmesh.new()
    # robe cone
    rf = _tube(bm, (0, 0, 0.02), (0, 0, 1.25), 0.34, 0.14, n=8)
    common.paint_faces(bm, rf, "grip", 0.22)
    sf = _tube(bm, (0, 0, 1.25), (0, -0.06, 1.52), 0.14, 0.11, n=8)
    common.paint_faces(bm, sf, "grip", 0.28)
    hf = _blob(bm, (0, -0.05, 1.6), 0.13, 0.95, r)
    common.paint_faces(bm, hf, "grip", 0.18)
    # glowing eyes + rune trim
    for sx in (-1, 1):
        ef = common.add_box(bm, (sx * 0.045, -0.16, 1.6), (0.025, 0.015, 0.02))
        common.paint_faces(bm, ef, "runic", 0.9)
    tf = _tube(bm, (0, 0, 0.5), (0, 0, 0.58), 0.30, 0.295, n=8)
    common.paint_faces(bm, tf, "runic", 0.6)
    for sx in (-1, 1):
        af = _tube(bm, (sx * 0.17, 0, 1.15), (sx * 0.26, -0.18, 0.75), 0.05, 0.04)
        common.paint_faces(bm, af, "grip", 0.25)
    return _finish("acolyte", bm)


def spider(seed=38):
    r = common.rng(seed, "spider")
    bm = bmesh.new()
    z = 0.32
    af = _blob(bm, (0, 0.28, z + 0.06), 0.3, 0.8, r)
    common.paint_faces(bm, af, "grip", 0.2)
    tfx = _blob(bm, (0, -0.12, z), 0.18, 0.8, r)
    common.paint_faces(bm, tfx, "grip", 0.3)
    for sx in (-1, 1):
        ef = common.add_box(bm, (sx * 0.06, -0.28, z + 0.04), (0.03, 0.02, 0.025))
        common.paint_faces(bm, ef, "gem", 0.85)
    for i in range(4):
        yy = -0.18 + i * 0.14
        for sx in (-1, 1):
            knee = (sx * 0.42, yy, z + 0.22)
            f1 = _tube(bm, (sx * 0.12, yy, z), knee, 0.03, 0.02, n=4)
            f2 = _tube(bm, knee, (sx * 0.62, yy + 0.05, 0), 0.02, 0.01, n=4)
            common.paint_faces(bm, f1 + f2, "grip", 0.32)
    return _finish("spider", bm)


def troll(seed=39):
    r = common.rng(seed, "troll")
    o = _biped("troll", r, 2.5, 2.1, 0.2, "stone", 0.4, "adamant", 0.32, hunch=0.3, club=True)
    return o


def cave_bat(seed=40):
    r = common.rng(seed, "bat")
    bm = bmesh.new()
    z = 1.5  # hovers
    bf = _blob(bm, (0, 0, z), 0.22, 0.8, r)
    common.paint_faces(bm, bf, "grip", 0.3)
    hf = _blob(bm, (0, -0.2, z + 0.05), 0.13, 0.9, r)
    common.paint_faces(bm, hf, "grip", 0.38)
    for sx in (-1, 1):
        ef = _tube(bm, (sx * 0.05, -0.22, z + 0.14), (sx * 0.1, -0.2, z + 0.26), 0.03, 0.004, n=4)
        common.paint_faces(bm, ef, "grip", 0.3)
    # membrane wings: two big thin fans
    for sx in (-1, 1):
        a = bm.verts.new((sx * 0.15, 0, z))
        b = bm.verts.new((sx * 0.95, 0.15, z + 0.3))
        c = bm.verts.new((sx * 0.75, 0.35, z + 0.05))
        d = bm.verts.new((sx * 0.45, 0.2, z - 0.05))
        f1 = bm.faces.new((a, b, c))
        f2 = bm.faces.new((a, c, d))
        common.paint_faces(bm, [f1, f2], "runic", 0.25)
    for sx in (-1, 1):
        ey = common.add_box(bm, (sx * 0.05, -0.31, z + 0.07), (0.03, 0.02, 0.025))
        common.paint_faces(bm, ey, "copper", 0.9)
    return _finish("cave_bat", bm)


ALL = {
    "vermin": vermin, "wolf": wolf, "goblin": goblin, "goblin_brute": goblin_brute,
    "bandit": bandit, "skeleton": skeleton, "cave_bat": cave_bat, "acolyte": acolyte, "spider": spider, "troll": troll,
}


def build_all(export=True):
    import export as exp

    objs = []
    for i, (name, fn) in enumerate(ALL.items()):
        o = fn()
        o.location = ((i % 5) * 3, (i // 5) * 4 - 12, 0)
        objs.append(o)
        if export:
            o.location = (0, 0, 0)
            exp.export_glb(o, "creatures", name)
    return objs
