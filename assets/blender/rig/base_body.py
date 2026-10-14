"""Modular low-poly bodies, rigid-skinned to WORLD_RIG, parametric per
race (human/elf/dwarf) and sex (m/f).

Five part meshes (head, torso, arms, legs, feet) so armor can replace parts.
Limbs are lofted octagonal tubes; every vertex is 100% weighted to one bone.
Faces are geometric: inset eyes, brow, nose, mouth, race-specific ears.

generate({"race": ..., "sex": ...}, seed) -> (rig, [parts]); deterministic.
Budget: <= 2,500 tris per body (actual ~1,100).
"""
import math

import bmesh
import bpy

try:
    import common
    import world_rig
    import head_sculpt
    import body_sculpt
except ImportError:
    from generators import common
    from rig import world_rig
    from rig import head_sculpt
    from rig import body_sculpt

N = 14  # ring segments (higher density for sculpted anatomy)
_HEAD_RACE_SEX = [("human", "m")]


def _ring(bm, cx, cy, cz, rx, ry):
    return [
        bm.verts.new((cx + rx * math.cos(2 * math.pi * i / N), cy + ry * math.sin(2 * math.pi * i / N), cz))
        for i in range(N)
    ]


def _bridge(bm, a, b):
    return [bm.faces.new((a[i], a[(i + 1) % N], b[(i + 1) % N], b[i])) for i in range(N)]


def _tube(bm, deform, points, cap_bottom=True, cap_top=True):
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
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        self.obj = bpy.data.objects.new(name, bpy.data.meshes.new(name))
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
            f.smooth = True
        self.bm.to_mesh(self.obj.data)
        self.bm.free()
        self.obj.data.materials.append(common.palette_material("gear"))
        self.obj.parent = self.rig
        self.obj.modifiers.new("Armature", "ARMATURE").object = self.rig
        return self.obj


def _build_head(rig, p, k, prefix, race="human", sex="m"):
    _HEAD_RACE_SEX[0] = (race, sex)
    part = _Part(f"{prefix}_head", rig)
    gi = part.g("head")
    gn = part.g("neck")
    hs = p["head"]
    skin = (p["skin_row"], p["skin_t"])
    z0 = k["head0"]

    # neck: tapered column meeting the trapezius below and jaw above
    part.paint(_tube(part.bm, part.deform, [
        (0, 0, k["neck0"] - 0.01, 0.072 * hs, 0.078 * hs, gn),
        (0, 0, (k["neck0"] + z0) / 2, 0.060 * hs, 0.066 * hs, gn),
        (0, 0, z0 + 0.04, 0.052 * hs, 0.057 * hs, gi),
    ]), *skin)

    jaw_z = z0 + 0.02
    skull_c = (0, 0.003, jaw_z + 0.115 * hs)
    R = 0.118 * hs

    # hand-sculpted skull, merged in and weighted to the head bone
    head_bm = head_sculpt.build_head_mesh(race, sex, p["skin_row"], p["skin_t"], R)
    tmp = bpy.data.meshes.new("_merge_head")
    head_bm.to_mesh(tmp)
    head_bm.free()
    before = set(part.bm.verts)
    part.bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    for v in part.bm.verts:
        if v not in before:
            v.co.x += skull_c[0]
            v.co.y += skull_c[1]
            v.co.z += skull_c[2]
            v[part.deform][gi] = 1.0

    face_y = -0.112 * hs
    eye_z = jaw_z + 0.125
    # front-planar UVs over the skull so the painted face texture lands on the
    # face; back/side faces clamp to a plain-skin corner of the texture.
    uvl = part.bm.loops.layers.uv.verify()
    hw = 1.55 * R
    hh = 1.95 * R
    for face in part.bm.faces:
        fc = face.calc_center_median()
        front = face.normal.y < -0.25 and fc.z > skull_c[2] - R * 0.9
        for loop in face.loops:
            v = loop.vert.co
            if front:
                u = 0.5 + (v.x - skull_c[0]) / hw
                vv = 0.5 + (v.z - skull_c[2]) / hh  # texture +v is up (forehead)
                loop[uvl].uv = (max(0.02, min(0.98, u)), max(0.02, min(0.98, vv)))
            else:
                loop[uvl].uv = (0.03, 0.03)  # plain-skin corner
    # ears (painted to skin-corner UV like the rest of the non-front)
    ear_z = eye_z - 0.01
    if p["ear"] == "point":
        for sx in (-1, 1):
            b = [part.bm.verts.new((sx * 0.1 * hs, y, ear_z + dz)) for y, dz in ((-0.02, -0.02), (0.02, -0.02), (0.0, 0.02))]
            tip = part.bm.verts.new((sx * 0.16 * hs, 0.035, ear_z + 0.045))
            for v in b + [tip]:
                v[part.deform][gi] = 1.0
            fs = [part.bm.faces.new((b[0], b[1], tip)), part.bm.faces.new((b[1], b[2], tip)), part.bm.faces.new((b[2], b[0], tip))]
            part.paint(fs, *skin)
    else:
        for sx in (-1, 1):
            part.paint(_box(part.bm, part.deform, gi, (sx * 0.108 * hs, 0.004, ear_z), (0.018, 0.03, 0.045 * hs)), *skin)
    obj = part.done()
    obj.data.materials.clear()
    obj.data.materials.append(common.face_material(race, sex))
    return obj


def _build_torso(rig, p, k, sex, prefix):
    _TORSO_CTX[0] = (p, k, sex)
    part = _Part(f"{prefix}_torso", rig)
    hips, spine, chest = part.g("hips"), part.g("spine"), part.g("chest")
    tw = p["torso_w"]
    hip_w = 0.155 * p["hip"]
    sh_w = 0.175 * p["shoulder"]
    waist = 0.125 * tw * (0.88 if sex == "f" else 1.0)
    bust = 0.155 * tw * (1.06 if sex == "f" else 0.97)
    part.paint(_tube(part.bm, part.deform, [
        (0, 0, k["hip_h"] - 0.02, hip_w, 0.105 * tw, hips),
        (0, 0, k["hip_h"] + 0.06, hip_w * 0.95, 0.100 * tw, hips),
        (0, 0, k["spine0"] + 0.05, waist, 0.092 * tw, spine),
        (0, 0, k["chest0"], bust, 0.105 * tw, chest),
        (0, -0.005 if sex == "f" else 0, k["chest0"] + 0.12, sh_w, 0.108 * tw, chest),
        (0, 0, k["neck0"] + 0.005, sh_w * 0.85, 0.095 * tw, chest),
    ]), "cloth", 0.52)
    # belt
    part.paint(_tube(part.bm, part.deform, [
        (0, 0, k["hip_h"] - 0.035, hip_w * 1.03, 0.11 * tw, hips),
        (0, 0, k["hip_h"] + 0.015, hip_w * 1.03, 0.11 * tw, hips),
    ]), "leather", 0.35)
    return part.done()


def _arm(part, p, k, side):
    s = 1 if side == "L" else -1
    sh, up, fo, ha = (part.g(f"{b}.{side}") for b in ("shoulder", "upper_arm", "forearm", "hand"))
    w = p["limb_w"]
    ax = k["arm_x"]
    part.paint(_tube(part.bm, part.deform, [
        (s * (ax + 0.012), 0, k["arm_top"] - 0.065, 0.055 * w, 0.062 * w, sh),
        (s * (ax + 0.008), 0, k["arm_top"] + 0.005, 0.075 * w, 0.082 * w, sh),
        (s * ax, 0, k["arm_top"] + 0.05, 0.045 * w, 0.055 * w, sh),
    ]), "cloth", 0.66)
    part.paint(_tube(part.bm, part.deform, [
        (s * ax, 0, k["arm_top"] - 0.05, 0.050 * w, 0.055 * w, up),
        (s * ax, -0.004, k["arm_top"] - 0.5 * (k["arm_top"] - k["elbow"]) * 0.6, 0.052 * w, 0.057 * w, up),
        (s * ax, 0, (k["arm_top"] + k["elbow"]) / 2, 0.046 * w, 0.050 * w, up),
        (s * ax, 0, k["elbow"], 0.040 * w, 0.044 * w, up),
    ]), "cloth", 0.47)
    part.paint(_tube(part.bm, part.deform, [
        (s * ax, 0, k["elbow"], 0.040 * w, 0.044 * w, fo),
        (s * ax, 0, (k["elbow"] + k["wrist"]) / 2, 0.036 * w, 0.040 * w, fo),
        (s * ax, 0, k["wrist"] + 0.01, 0.030 * w, 0.034 * w, fo),
    ]), p["skin_row"], p["skin_t"])
    # palm block
    hz0 = k["wrist"] + 0.01
    hz1 = k["hand_end"] + 0.02
    palm = _box(part.bm, part.deform, ha, (s * ax, -0.004, (hz0 + hz1) / 2), (0.075 * w, 0.034 * w, (hz0 - hz1) + 0.03))
    part.paint(palm, p["skin_row"], p["skin_t"] - 0.07)
    # four finger ridges hanging from the palm
    for fi in range(4):
        fx = s * (ax + (fi - 1.5) * 0.022 * w)
        flen = 0.055 - abs(fi - 1.5) * 0.008
        fg = _box(part.bm, part.deform, ha, (fx, -0.01, hz1 - flen / 2 - 0.01), (0.017 * w, 0.028 * w, flen))
        part.paint(fg, p["skin_row"], p["skin_t"] - 0.1)
        # knuckle crease
    # thumb off the inner side
    tb = _box(part.bm, part.deform, ha, (s * (ax - 0.045 * w), -0.01, hz0 - 0.03), (0.018 * w, 0.026 * w, 0.045))
    part.paint(tb, p["skin_row"], p["skin_t"] - 0.1)


_TORSO_CTX = [None]


def _build_arms(rig, p, k, prefix):
    part = _Part(f"{prefix}_arms", rig)
    _arm(part, p, k, "L")
    _arm(part, p, k, "R")
    return part.done()


def _build_legs(rig, p, k, prefix):
    part = _Part(f"{prefix}_legs", rig)
    w = p["limb_w"]
    tx = k["thigh_x"]
    for side, s in (("L", 1), ("R", -1)):
        th, sn = part.g(f"thigh.{side}"), part.g(f"shin.{side}")
        part.paint(_tube(part.bm, part.deform, [
            (s * tx, 0, k["hip_h"] + 0.01, 0.068 * w, 0.075 * w, th),
            (s * tx, 0, (k["hip_h"] + k["knee"]) / 2, 0.060 * w, 0.066 * w, th),
            (s * tx, 0, k["knee"], 0.050 * w, 0.055 * w, th),
        ]), "leather", 0.50)
        part.paint(_tube(part.bm, part.deform, [
            (s * tx, 0, k["knee"], 0.048 * w, 0.053 * w, sn),
            (s * tx, 0.006, k["knee"] - (k["knee"] - k["ankle"]) * 0.3, 0.050 * w, 0.056 * w, sn),
            (s * tx, 0, (k["knee"] + k["ankle"]) / 2, 0.040 * w, 0.045 * w, sn),
            (s * tx, 0.005, k["ankle"] + 0.03, 0.034 * w, 0.038 * w, sn),
        ]), "leather", 0.40)
    return part.done()


def _build_feet(rig, p, k, prefix):
    part = _Part(f"{prefix}_feet", rig)
    w = p["limb_w"]
    tx = k["thigh_x"]
    for side, s in (("L", 1), ("R", -1)):
        gi = part.g(f"foot.{side}")
        part.paint(_tube(part.bm, part.deform, [
            (s * tx, 0.005, k["ankle"] + 0.05, 0.046 * w, 0.050 * w, gi),
            (s * tx, 0.005, 0.07, 0.052 * w, 0.058 * w, gi),
        ]), "grip", 0.55)
        part.paint(_tube(part.bm, part.deform, [
            (s * tx, 0.01, 0.045, 0.050 * w, 0.055 * w, gi),
            (s * tx, -0.06, 0.040, 0.048 * w, 0.062 * w, gi),
            (s * tx, -0.13, 0.035, 0.040 * w, 0.052 * w, gi),
        ]), "grip", 0.45)
    return part.done()


def generate(params: dict, seed: int = 0):
    """Build a race/sex body on its own WORLD_RIG. Returns (rig, [parts])."""
    race = params.get("race", "human")
    sex = params.get("sex", "m")
    p = world_rig.proportions(race, sex)
    k = world_rig.key_heights(p)
    prefix = f"body_{race}_{sex}"
    rig = world_rig.build_rig(p, name=f"RIG_{race}_{sex}")
    head = _build_head(rig, p, k, prefix, race, sex)
    torso = _build_torso(rig, p, k, sex, prefix)
    arms = _build_arms(rig, p, k, prefix)
    legs = _build_legs(rig, p, k, prefix)
    feet = _build_feet(rig, p, k, prefix)
    # anatomical sculpt refinement (moves existing verts; weights preserved)
    body_sculpt.torso(torso, p, k, sex)
    body_sculpt.arms(arms, p, k)
    body_sculpt.legs(legs, p, k)
    parts = [head, torso, arms, legs, feet]
    return rig, parts
