"""Animation clips for WORLD_RIG, authored procedurally.

Each clip is a bpy Action; all clips are pushed onto NLA tracks so the glTF
exporter emits every clip from one file. Densely sampled layered sinusoids:
gaits get hip sway, shoulder counter-rotation, foot roll and head
stabilization on top of the limb swings.

v1 clips here: idle, walk, run. (attack/cast/gather/hit/death follow.)
"""
import math

import bpy

FPS = 30
TAU = 2 * math.pi


def _key(rig, frame, bone, rot=None, loc=None):
    pb = rig.pose.bones[bone]
    if rot is not None:
        pb.rotation_euler = rot
        pb.keyframe_insert("rotation_euler", frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert("location", frame=frame)


def _new_action(rig, name):
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def _cycle(rig, name, length, step, pose_at):
    """Looping action: pose_at(rig, frame, phase in [0,1)) keyed every `step` frames."""
    act = _new_action(rig, name)
    for f in range(0, length + 1, step):
        pose_at(rig, f, (f % length) / length)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = length
    return act


def build_idle(rig):
    def pose(rig, f, t):
        breath = math.sin(TAU * t)          # one breath per loop
        sway = math.sin(TAU * t * 2 + 1.3)  # slow secondary sway
        _key(rig, f, "chest", rot=(0.030 * breath, 0, 0.012 * sway))
        _key(rig, f, "spine", rot=(0.012 * breath, 0, -0.008 * sway))
        _key(rig, f, "neck", rot=(-0.015 * breath, 0, 0))
        _key(rig, f, "head", rot=(-0.015 * breath, 0.01 * sway, 0))
        _key(rig, f, "shoulder.L", rot=(0, 0.03 * breath, 0))
        _key(rig, f, "shoulder.R", rot=(0, -0.03 * breath, 0))
        _key(rig, f, "upper_arm.L", rot=(0.035 * breath, 0, 0.05 + 0.012 * sway))
        _key(rig, f, "upper_arm.R", rot=(0.035 * breath, 0, -0.05 - 0.012 * sway))
        _key(rig, f, "forearm.L", rot=(-0.10 - 0.02 * breath, 0, 0))
        _key(rig, f, "forearm.R", rot=(-0.10 - 0.02 * breath, 0, 0))
        _key(rig, f, "hips", loc=(0, 0, 0.007 * breath))
    return _cycle(rig, "idle", 120, 6, pose)


def _gait(rig, name, length, swing, arm_swing, knee, bob, lean, sway):
    """One full stride cycle (L then R). Layered body mechanics on top of limb swings."""

    def pose(rig, f, t):
        s = math.sin(TAU * t)
        c = math.cos(TAU * t)
        s2 = math.sin(2 * TAU * t)  # double-frequency: two steps per cycle

        # legs: thigh swing, knee bends on the trailing/passing leg, foot roll
        _key(rig, f, "thigh.L", rot=(swing * s, 0, 0))
        _key(rig, f, "thigh.R", rot=(-swing * s, 0, 0))
        # knee bends hard during swing-through recovery (leg moving back->front),
        # stays near-straight under load during stance. On a down-pointing bone,
        # flexion (foot moving backward) is POSITIVE local-X rotation.
        _key(rig, f, "shin.L", rot=(knee * max(0.0, -c) + 0.08, 0, 0))
        _key(rig, f, "shin.R", rot=(knee * max(0.0, c) + 0.08, 0, 0))
        # heel strike (toes up) on the forward swing, toe tucks during recovery
        _key(rig, f, "foot.L", rot=(0.45 * swing * s + 0.15 * knee * max(0.0, -c), 0, 0))
        _key(rig, f, "foot.R", rot=(-0.45 * swing * s + 0.15 * knee * max(0.0, c), 0, 0))

        # pelvis: lateral sway toward the planted foot + yaw with the stride
        _key(rig, f, "hips", rot=(0, 0.5 * sway * s, 0.6 * sway * s), loc=(0.012 * s, 0, -bob * abs(c)))

        # torso: lean + counter-rotation against the hips, head stabilizes
        _key(rig, f, "spine", rot=(lean * 0.4, -0.3 * sway * s, -0.4 * sway * s))
        _key(rig, f, "chest", rot=(lean, -0.5 * sway * s, -0.3 * sway * s))
        _key(rig, f, "neck", rot=(-lean * 0.5, 0.2 * sway * s, 0))
        _key(rig, f, "head", rot=(-lean * 0.4 + 0.02 * s2, 0.3 * sway * s, 0))

        # arms: counter-swing with a resting elbow bend that deepens on the back swing
        _key(rig, f, "shoulder.L", rot=(0, -0.25 * sway * s, 0))
        _key(rig, f, "shoulder.R", rot=(0, -0.25 * sway * s, 0))
        _key(rig, f, "upper_arm.L", rot=(-arm_swing * s, 0, 0.06))
        _key(rig, f, "upper_arm.R", rot=(arm_swing * s, 0, -0.06))
        _key(rig, f, "forearm.L", rot=(-0.25 - 0.55 * arm_swing * (1 + s) / 2, 0, 0))
        _key(rig, f, "forearm.R", rot=(-0.25 - 0.55 * arm_swing * (1 - s) / 2, 0, 0))

    return _cycle(rig, name, length, 2, pose)


def build_walk(rig):
    return _gait(rig, "walk", 32, swing=0.55, arm_swing=0.32, knee=0.85, bob=0.025, lean=0.05, sway=0.10)


def build_run(rig):
    return _gait(rig, "run", 18, swing=0.95, arm_swing=0.70, knee=1.30, bob=0.055, lean=0.20, sway=0.14)


def _swing(rig, name, length, raise_amt, chop_depth, twist):
    """Repeating two-arm tool swing: wind up high, strike down-forward."""

    def pose(rig, f, t):
        # ease-out strike: slow raise (0..0.6), fast fall (0.6..0.8), recover
        if t < 0.6:
            k = t / 0.6  # winding up
            arm = -raise_amt * math.sin(k * math.pi / 2)
            lean = 0.04
        elif t < 0.8:
            k = (t - 0.6) / 0.2
            arm = -raise_amt + (raise_amt + chop_depth) * (k * k)
            lean = 0.04 + 0.14 * k
        else:
            k = (t - 0.8) / 0.2
            arm = chop_depth * (1 - k)
            lean = 0.18 * (1 - k) + 0.04 * k
        for side, off in (("L", 0.05), ("R", -0.05)):
            _key(rig, f, f"upper_arm.{side}", rot=(arm, 0, off * (1 + twist)))
            _key(rig, f, f"forearm.{side}", rot=(-0.35 - 0.25 * max(0.0, -arm), 0, 0))
        _key(rig, f, "chest", rot=(lean, 0, twist * math.sin(TAU * t)))
        _key(rig, f, "spine", rot=(lean * 0.5, 0, 0))
        _key(rig, f, "hips", loc=(0, 0, -0.02 * math.sin(TAU * t)))

    return _cycle(rig, name, length, 2, pose)


def build_chop(rig):
    return _swing(rig, "chop", 36, raise_amt=1.9, chop_depth=0.5, twist=0.10)


def build_mine(rig):
    return _swing(rig, "mine", 32, raise_amt=1.5, chop_depth=0.75, twist=0.05)


def build_swim(rig):
    """Upright treading-water paddle: alternating arm sweeps, legs kicking."""

    def pose(rig, f, t):
        s = math.sin(TAU * t)
        c = math.cos(TAU * t)
        _key(rig, f, "upper_arm.L", rot=(-0.9 - 0.5 * s, 0, 0.35))
        _key(rig, f, "upper_arm.R", rot=(-0.9 + 0.5 * s, 0, -0.35))
        _key(rig, f, "forearm.L", rot=(-0.5 - 0.3 * c, 0, 0))
        _key(rig, f, "forearm.R", rot=(-0.5 + 0.3 * c, 0, 0))
        _key(rig, f, "thigh.L", rot=(0.35 * s, 0, 0))
        _key(rig, f, "thigh.R", rot=(-0.35 * s, 0, 0))
        _key(rig, f, "shin.L", rot=(0.4 * max(0.0, -s) + 0.1, 0, 0))
        _key(rig, f, "shin.R", rot=(0.4 * max(0.0, s) + 0.1, 0, 0))
        _key(rig, f, "chest", rot=(0.22, 0, 0.05 * s))
        _key(rig, f, "hips", loc=(0, 0, 0.04 * math.sin(2 * TAU * t)))

    return _cycle(rig, "swim", 36, 3, pose)


def build_all(rig):
    bpy.context.scene.render.fps = FPS
    acts = [build_idle(rig), build_walk(rig), build_run(rig), build_chop(rig), build_mine(rig), build_swim(rig)]
    ad = rig.animation_data
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for act in acts:
        track = ad.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 0, act)
    return acts
