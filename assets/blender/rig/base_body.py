"""Modular low-poly base body, rigid-skinned to WORLD_RIG.

Five part meshes (head, torso, arms, legs, feet) so armor can replace parts
at runtime. Every segment box is 100% weighted to exactly one bone — the
chunky flat-shaded look deforms cleanly with no weight painting.

generate(params, seed) contract like all generators; params/seed currently
only jitter nothing (one canonical body) but keep the signature stable.
"""
import bmesh
import bpy
from mathutils import Vector

try:
    import common
    import world_rig
except ImportError:
    from generators import common
    from rig import world_rig

# part -> [(bone, center, size, palette_row, shade_t)]
# centers/sizes in world space, matching rig proportions in world_rig.BONES
SEGMENTS = {
    "head": [
        ("head", (0, 0, 1.63), (0.22, 0.24, 0.26), "bone", 0.70),
        ("neck", (0, 0, 1.46), (0.10, 0.10, 0.10), "bone", 0.60),
    ],
    "torso": [
        ("chest", (0, 0, 1.31), (0.34, 0.22, 0.24), "cloth", 0.55),
        ("spine", (0, 0, 1.14), (0.28, 0.20, 0.16), "cloth", 0.45),
        ("hips", (0, 0, 0.99), (0.30, 0.21, 0.16), "leather", 0.45),
    ],
    "arms": [
        ("shoulder.L", (0.17, 0, 1.39), (0.14, 0.15, 0.13), "cloth", 0.62),
        ("upper_arm.L", (0.16, 0, 1.25), (0.11, 0.12, 0.26), "cloth", 0.50),
        ("forearm.L", (0.16, 0, 1.00), (0.10, 0.10, 0.24), "bone", 0.62),
        ("hand.L", (0.16, 0, 0.82), (0.09, 0.11, 0.13), "bone", 0.55),
        ("shoulder.R", (-0.17, 0, 1.39), (0.14, 0.15, 0.13), "cloth", 0.62),
        ("upper_arm.R", (-0.16, 0, 1.25), (0.11, 0.12, 0.26), "cloth", 0.50),
        ("forearm.R", (-0.16, 0, 1.00), (0.10, 0.10, 0.24), "bone", 0.62),
        ("hand.R", (-0.16, 0, 0.82), (0.09, 0.11, 0.13), "bone", 0.55),
    ],
    "legs": [
        ("thigh.L", (0.09, 0, 0.72), (0.14, 0.15, 0.40), "leather", 0.50),
        ("shin.L", (0.09, 0, 0.30), (0.12, 0.13, 0.40), "leather", 0.40),
        ("thigh.R", (-0.09, 0, 0.72), (0.14, 0.15, 0.40), "leather", 0.50),
        ("shin.R", (-0.09, 0, 0.30), (0.12, 0.13, 0.40), "leather", 0.40),
    ],
    "feet": [
        ("foot.L", (0.09, -0.05, 0.05), (0.12, 0.26, 0.10), "grip", 0.50),
        ("foot.R", (-0.09, -0.05, 0.05), (0.12, 0.26, 0.10), "grip", 0.50),
    ],
}


def _build_part(name: str, segments, rig: bpy.types.Object) -> bpy.types.Object:
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    group_index: dict[str, int] = {}
    mesh = bpy.data.meshes.new(f"body_{name}")
    obj = bpy.data.objects.new(f"body_{name}", mesh)
    bpy.context.collection.objects.link(obj)

    for bone, center, size, row, t in segments:
        if bone not in group_index:
            group_index[bone] = len(obj.vertex_groups)
            obj.vertex_groups.new(name=bone)
        gi = group_index[bone]
        before = set(bm.verts)
        faces = common.add_box(bm, center, size)
        common.paint_faces(bm, faces, row, t)
        for v in bm.verts:
            if v not in before:
                v[deform][gi] = 1.0

    for f in bm.faces:
        f.smooth = False
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(common.palette_material("gear"))

    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return obj


def generate(params: dict, seed: int):
    """Build WORLD_RIG + all body parts. Returns (rig, [parts])."""
    rig = world_rig.build_rig()
    parts = [_build_part(n, segs, rig) for n, segs in SEGMENTS.items()]
    return rig, parts
