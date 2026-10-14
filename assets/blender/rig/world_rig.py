"""WORLD_RIG — the shared humanoid armature.

~1.75 m character, Z-up, facing -Y (Blender forward). Rigid low-poly rig:
every body segment is 100% weighted to one bone. Sockets are leaf bones
(socket.hand_r, socket.hand_l, socket.back, socket.head) that gear meshes
attach to at runtime.

build_rig() is idempotent: removes any existing WORLD_RIG first.
"""
import bpy
from mathutils import Vector

RIG_NAME = "WORLD_RIG"

# name: (head, tail, parent, connected)
BONES = {
    "root":        ((0, 0, 0),        (0, 0.25, 0),      None,       False),
    "hips":        ((0, 0, 0.92),     (0, 0, 1.06),      "root",     False),
    "spine":       ((0, 0, 1.06),     (0, 0, 1.22),      "hips",     True),
    "chest":       ((0, 0, 1.22),     (0, 0, 1.42),      "spine",    True),
    "neck":        ((0, 0, 1.42),     (0, 0, 1.50),      "chest",    True),
    "head":        ((0, 0, 1.50),     (0, 0, 1.76),      "neck",     True),
    "shoulder.L":  ((0.04, 0, 1.38),  (0.14, 0, 1.40),   "chest",    False),
    "upper_arm.L": ((0.16, 0, 1.38),  (0.16, 0, 1.12),   "shoulder.L", False),
    "forearm.L":   ((0.16, 0, 1.12),  (0.16, 0, 0.88),   "upper_arm.L", True),
    "hand.L":      ((0.16, 0, 0.88),  (0.16, 0, 0.76),   "forearm.L", True),
    "shoulder.R":  ((-0.04, 0, 1.38), (-0.14, 0, 1.40),  "chest",    False),
    "upper_arm.R": ((-0.16, 0, 1.38), (-0.16, 0, 1.12),  "shoulder.R", False),
    "forearm.R":   ((-0.16, 0, 1.12), (-0.16, 0, 0.88),  "upper_arm.R", True),
    "hand.R":      ((-0.16, 0, 0.88), (-0.16, 0, 0.76),  "forearm.R", True),
    "thigh.L":     ((0.09, 0, 0.92),  (0.09, 0, 0.50),   "hips",     False),
    "shin.L":      ((0.09, 0, 0.50),  (0.09, 0, 0.09),   "thigh.L",  True),
    "foot.L":      ((0.09, 0, 0.09),  (0.09, -0.16, 0.02), "shin.L", True),
    "thigh.R":     ((-0.09, 0, 0.92), (-0.09, 0, 0.50),  "hips",     False),
    "shin.R":      ((-0.09, 0, 0.50), (-0.09, 0, 0.09),  "thigh.R",  True),
    "foot.R":      ((-0.09, 0, 0.09), (-0.09, -0.16, 0.02), "shin.R", True),
    # sockets — gear attach points
    "socket.hand_r": ((-0.16, 0, 0.82), (-0.16, -0.08, 0.82), "hand.R", False),
    "socket.hand_l": ((0.16, 0, 0.82),  (0.16, -0.08, 0.82),  "hand.L", False),
    "socket.back":   ((0, 0.10, 1.30),  (0, 0.18, 1.30),      "chest",  False),
    "socket.head":   ((0, 0, 1.76),     (0, 0, 1.84),         "head",   False),
}

DEFORM_BONES = [b for b in BONES if not b.startswith(("socket.", "root"))]


def build_rig() -> bpy.types.Object:
    old = bpy.data.objects.get(RIG_NAME)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(RIG_NAME)
    rig = bpy.data.objects.new(RIG_NAME, arm)
    bpy.context.collection.objects.link(rig)

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = {}
    for name, (head, tail, parent, connected) in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        ebones[name] = eb
    for name, (_, _, parent, connected) in BONES.items():
        if parent:
            ebones[name].parent = ebones[parent]
            ebones[name].use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")

    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    for name in BONES:
        arm.bones[name].use_deform = name in DEFORM_BONES
    return rig
