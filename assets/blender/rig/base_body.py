"""Modular low-poly base body, rigid-skinned to WORLD_RIG.

Five part meshes (head, torso, arms, legs, feet) so armor can replace parts
at runtime. Limbs are lofted octagonal tubes with taper; every vertex is
100% weighted to exactly one bone (per-ring assignment), so the chunky
flat-shaded look deforms cleanly with no weight painting.

Budget: <= 2,500 tris for the full humanoid (actual ~1,000).
"""
import math

import bmesh
import bpy

try:
    import common
    import world_rig
except ImportError:
    from generators import common
    from rig import world_rig

N = 8  # ring segments


def _ring(bm, cx, cy, cz, rx, ry):
    return [
        bm.verts.new((cx + rx * math.cos(2 * math.pi * i / N), cy + ry * math.sin(2 * math.pi * i / N), cz))
        for i in range(N)
    ]


def _bridge(bm, a, b):
    faces = []
    for i in range(N):
        faces.append(bm.faces.new((a[i], a[(i + 1) % N], b[(i + 1) % N], b[i])))
    return faces


def _tube(bm, deform, points, cap_bottom=True, cap_top=True):
    """points: [(cx, cy, cz, rx, ry, group_index)]. Lofted octagonal tube."""
    rings = []
    faces = []
    for cx, cy, cz, rx, ry, gi in points:
        ring = _ring(bm, cx, cy, cz, rx, ry)
        for v in ring:
            v[deform][gi] = 1.0
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        faces += _bridge(bm, a, b)
    if cap_bottom:
        faces.append(bm.faces.new(tuple(reversed(rings[0]))))
    if cap_top:
        faces.append(bm.faces.new(tuple(rings[-1])))
    return faces


def _box(bm, deform, gi, center, size):
    before = set(bm.verts)
    faces = common.add_box(bm, center, size)
    for v in bm.verts:
        if v not in before:
            v[deform][gi] = 1.0
    return faces


class _Part:
    def __init__(self, name, rig):
        self.obj = bpy.data.objects.new(f"body_{name}", bpy.data.meshes.new(f"body_{name}"))
        bpy.context.collection.objects.link(self.obj)
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.rig = rig
        self._groups = {}

    def g(self, bone):
        if bone not in self._groups:
            self._groups[bone] = len(self.obj.vertex_groups)
            self.obj.vertex_groups.new(name=bone)
        return self._groups[bone]

    def paint(self, faces, row, t):
        common.paint_faces(self.bm, faces, row, t)

    def done(self):
        for f in self.bm.faces:
            f.smooth = False
        self.bm.to_mesh(self.obj.data)
        self.bm.free()
        self.obj.data.materials.append(common.palette_material("gear"))
        self.obj.parent = self.rig
        self.obj.modifiers.new("Armature", "ARMATURE").object = self.rig
        return self.obj


def _build_head(rig):
    p = _Part("head", rig)
    gi = p.g("head")
    gn = p.g("neck")
    # neck stub + lofted skull: jaw -> cheeks -> skull -> crown
    p.paint(_tube(p.bm, p.deform, [
        (0, 0, 1.42, 0.055, 0.06, gn),
        (0, 0, 1.52, 0.055, 0.06, gi),
    ]), "bone", 0.55)
    p.paint(_tube(p.bm, p.deform, [
        (0, 0.005, 1.52, 0.075, 0.082, gi),
        (0, 0.0, 1.565, 0.098, 0.105, gi),
        (0, 0.0, 1.66, 0.108, 0.115, gi),
        (0, 0.005, 1.73, 0.095, 0.10, gi),
    ], cap_bottom=True, cap_top=True), "bone", 0.72)
    # nose wedge on the face (-Y is forward)
    p.paint(_box(p.bm, p.deform, gi, (0, -0.115, 1.615), (0.035, 0.035, 0.05)), "bone", 0.80)
    return p.done()


def _build_torso(rig):
    p = _Part("torso", rig)
    hips, spine, chest = p.g("hips"), p.g("spine"), p.g("chest")
    p.paint(_tube(p.bm, p.deform, [
        (0, 0, 0.92, 0.155, 0.105, hips),
        (0, 0, 1.00, 0.145, 0.100, hips),
        (0, 0, 1.10, 0.125, 0.092, spine),
        (0, 0, 1.22, 0.150, 0.100, chest),
        (0, 0, 1.345, 0.175, 0.108, chest),
        (0, 0, 1.425, 0.150, 0.095, chest),
    ]), "cloth", 0.52)
    # belt
    p.paint(_tube(p.bm, p.deform, [
        (0, 0, 0.90, 0.160, 0.110, hips),
        (0, 0, 0.955, 0.160, 0.110, hips),
    ]), "leather", 0.35)
    return p.done()


def _arm(p, side):
    s = 1 if side == "L" else -1
    sh, up, fo, ha = (p.g(f"{b}.{side}") for b in ("shoulder", "upper_arm", "forearm", "hand"))
    # shoulder pad
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.175, 0, 1.315, 0.055, 0.062, sh),
        (s * 0.172, 0, 1.38, 0.075, 0.082, sh),
        (s * 0.165, 0, 1.43, 0.045, 0.055, sh),
    ]), "cloth", 0.66)
    # upper arm + forearm with elbow taper
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.165, 0, 1.33, 0.050, 0.055, up),
        (s * 0.162, 0, 1.20, 0.046, 0.050, up),
        (s * 0.160, 0, 1.12, 0.042, 0.046, up),
    ]), "cloth", 0.47)
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.160, 0, 1.12, 0.040, 0.044, fo),
        (s * 0.160, 0, 1.00, 0.036, 0.040, fo),
        (s * 0.160, 0, 0.90, 0.030, 0.034, fo),
    ]), "bone", 0.62)
    # mitt hand
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.160, 0, 0.90, 0.034, 0.042, ha),
        (s * 0.160, -0.005, 0.83, 0.036, 0.046, ha),
        (s * 0.158, -0.008, 0.77, 0.026, 0.034, ha),
    ]), "bone", 0.52)


def _build_arms(rig):
    p = _Part("arms", rig)
    _arm(p, "L")
    _arm(p, "R")
    return p.done()


def _leg(p, side):
    s = 1 if side == "L" else -1
    th, sn = p.g(f"thigh.{side}"), p.g(f"shin.{side}")
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.09, 0, 0.93, 0.068, 0.075, th),
        (s * 0.09, 0, 0.72, 0.060, 0.066, th),
        (s * 0.09, 0, 0.52, 0.050, 0.055, th),
    ]), "leather", 0.50)
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.09, 0, 0.52, 0.048, 0.053, sn),
        (s * 0.09, 0, 0.30, 0.042, 0.047, sn),
        (s * 0.09, 0.005, 0.12, 0.038, 0.042, sn),
    ]), "leather", 0.40)


def _build_legs(rig):
    p = _Part("legs", rig)
    _leg(p, "L")
    _leg(p, "R")
    return p.done()


def _foot(p, side):
    s = 1 if side == "L" else -1
    gi = p.g(f"foot.{side}")
    # boot cuff + lofted toe (forward is -Y)
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.09, 0.005, 0.14, 0.046, 0.050, gi),
        (s * 0.09, 0.005, 0.07, 0.052, 0.058, gi),
    ]), "grip", 0.55)
    p.paint(_tube(p.bm, p.deform, [
        (s * 0.09, 0.01, 0.045, 0.050, 0.055, gi),
        (s * 0.09, -0.06, 0.040, 0.048, 0.062, gi),
        (s * 0.09, -0.13, 0.035, 0.040, 0.052, gi),
    ]), "grip", 0.45)
    return gi


def _build_feet(rig):
    p = _Part("feet", rig)
    _foot(p, "L")
    _foot(p, "R")
    return p.done()


def generate(params: dict, seed: int):
    """Build WORLD_RIG + all body parts. Returns (rig, [parts])."""
    rig = world_rig.build_rig()
    parts = [
        _build_head(rig),
        _build_torso(rig),
        _build_arms(rig),
        _build_legs(rig),
        _build_feet(rig),
    ]
    return rig, parts
