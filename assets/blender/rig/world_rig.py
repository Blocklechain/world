"""WORLD_RIG — the shared humanoid armature, parametric per race/sex.

Bone NAMES and hierarchy are identical for every race, so all animation clips
apply to every body. Only bone positions/lengths change with proportions.
Z-up, facing -Y. Sockets are leaf bones gear attaches to at runtime.
"""
import bpy
from mathutils import Vector

RIG_NAME = "WORLD_RIG"


def proportions(race: str, sex: str) -> dict:
    p = dict(
        leg=1.0, arm=1.0, limb_w=1.0, shoulder=1.0, hip=1.0,
        torso_w=1.0, head=1.0, ear="round", nose=1.0,
        skin_row="bone", skin_t=0.62,
    )
    if race == "elf":
        p.update(leg=1.08, arm=1.04, limb_w=0.88, shoulder=0.95, head=0.94,
                 ear="point", nose=0.85, skin_t=0.8)
    elif race == "dwarf":
        p.update(leg=0.58, arm=0.95, limb_w=1.35, shoulder=1.28, hip=1.15,
                 torso_w=1.22, head=1.12, nose=1.35, skin_t=0.5)
    if sex == "f":
        p["shoulder"] *= 0.84
        p["hip"] *= 1.12
        p["limb_w"] *= 0.88
        p["torso_w"] *= 0.9
    return p


def key_heights(p: dict) -> dict:
    """Derived landmark heights/offsets shared by rig and body builders."""
    hip_h = 0.92 * p["leg"]
    spine0 = hip_h + 0.14
    chest0 = spine0 + 0.16
    neck0 = chest0 + 0.2
    head0 = neck0 + 0.08
    head_top = head0 + 0.26 * p["head"]
    sh_x = 0.14 * p["shoulder"]
    arm_x = 0.16 * p["shoulder"] + 0.02 * (p["limb_w"] - 1)
    arm_top = chest0 + 0.16
    upper_len = 0.26 * p["arm"]
    fore_len = 0.24 * p["arm"]
    hand_len = 0.12
    thigh_x = 0.09 * p["hip"]
    return dict(
        hip_h=hip_h, spine0=spine0, chest0=chest0, neck0=neck0, head0=head0,
        head_top=head_top, sh_x=sh_x, arm_x=arm_x, arm_top=arm_top,
        elbow=arm_top - upper_len, wrist=arm_top - upper_len - fore_len,
        hand_end=arm_top - upper_len - fore_len - hand_len,
        thigh_x=thigh_x, knee=hip_h - (hip_h - 0.09) * 0.52, ankle=0.09,
    )


def bone_table(p: dict) -> dict:
    k = key_heights(p)
    return {
        "root":        ((0, 0, 0), (0, 0.25, 0), None, False),
        "hips":        ((0, 0, k["hip_h"]), (0, 0, k["spine0"]), "root", False),
        "spine":       ((0, 0, k["spine0"]), (0, 0, k["chest0"]), "hips", True),
        "chest":       ((0, 0, k["chest0"]), (0, 0, k["neck0"]), "spine", True),
        "neck":        ((0, 0, k["neck0"]), (0, 0, k["head0"]), "chest", True),
        "head":        ((0, 0, k["head0"]), (0, 0, k["head_top"]), "neck", True),
        "shoulder.L":  ((k["sh_x"] * 0.3, 0, k["arm_top"]), (k["sh_x"], 0, k["arm_top"] + 0.02), "chest", False),
        "upper_arm.L": ((k["arm_x"], 0, k["arm_top"]), (k["arm_x"], 0, k["elbow"]), "shoulder.L", False),
        "forearm.L":   ((k["arm_x"], 0, k["elbow"]), (k["arm_x"], 0, k["wrist"]), "upper_arm.L", True),
        "hand.L":      ((k["arm_x"], 0, k["wrist"]), (k["arm_x"], 0, k["hand_end"]), "forearm.L", True),
        "shoulder.R":  ((-k["sh_x"] * 0.3, 0, k["arm_top"]), (-k["sh_x"], 0, k["arm_top"] + 0.02), "chest", False),
        "upper_arm.R": ((-k["arm_x"], 0, k["arm_top"]), (-k["arm_x"], 0, k["elbow"]), "shoulder.R", False),
        "forearm.R":   ((-k["arm_x"], 0, k["elbow"]), (-k["arm_x"], 0, k["wrist"]), "upper_arm.R", True),
        "hand.R":      ((-k["arm_x"], 0, k["wrist"]), (-k["arm_x"], 0, k["hand_end"]), "forearm.R", True),
        "thigh.L":     ((k["thigh_x"], 0, k["hip_h"]), (k["thigh_x"], 0, k["knee"]), "hips", False),
        "shin.L":      ((k["thigh_x"], 0, k["knee"]), (k["thigh_x"], 0, k["ankle"]), "thigh.L", True),
        "foot.L":      ((k["thigh_x"], 0, k["ankle"]), (k["thigh_x"], -0.16, 0.02), "shin.L", True),
        "thigh.R":     ((-k["thigh_x"], 0, k["hip_h"]), (-k["thigh_x"], 0, k["knee"]), "hips", False),
        "shin.R":      ((-k["thigh_x"], 0, k["knee"]), (-k["thigh_x"], 0, k["ankle"]), "thigh.R", True),
        "foot.R":      ((-k["thigh_x"], 0, k["ankle"]), (-k["thigh_x"], -0.16, 0.02), "shin.R", True),
        "socket.hand_r": ((-k["arm_x"], 0, k["wrist"] - 0.06), (-k["arm_x"], -0.08, k["wrist"] - 0.06), "hand.R", False),
        "socket.hand_l": ((k["arm_x"], 0, k["wrist"] - 0.06), (k["arm_x"], -0.08, k["wrist"] - 0.06), "hand.L", False),
        "socket.back":   ((0, 0.10, k["chest0"] + 0.08), (0, 0.18, k["chest0"] + 0.08), "chest", False),
        "socket.head":   ((0, 0, k["head_top"]), (0, 0, k["head_top"] + 0.08), "head", False),
    }


def build_rig(p: dict | None = None, name: str = RIG_NAME) -> bpy.types.Object:
    p = p or proportions("human", "m")
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.collection.objects.link(rig)

    bones = bone_table(p)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = {}
    for bname, (head, tail, parent, connected) in bones.items():
        eb = arm.edit_bones.new(bname)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        ebones[bname] = eb
    for bname, (_, _, parent, connected) in bones.items():
        if parent:
            ebones[bname].parent = ebones[parent]
            ebones[bname].use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")

    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    for bname in bones:
        arm.bones[bname].use_deform = not bname.startswith(("socket.", "root"))
    return rig
