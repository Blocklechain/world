"""Animation clips for WORLD_RIG, authored procedurally.

Each clip is a bpy Action; all clips are pushed onto NLA tracks so the glTF
exporter emits every clip from one file. Sampled sinusoid keyframes — chunky
rigid-rig motion suits the low-poly style.

v1 clips here: idle, walk, run. (attack/cast/gather/hit/death follow.)
"""
import math

import bpy

FPS = 30


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
    # reset pose
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def _cycle(rig, name, length, step, pose_at):
    """Build a looping action: pose_at(phase in [0,1)) sets the pose, keyed every `step` frames."""
    act = _new_action(rig, name)
    for f in range(0, length + 1, step):
        phase = (f % length) / length
        pose_at(rig, f, phase)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = length
    return act


def build_idle(rig):
    def pose(rig, f, t):
        s = math.sin(2 * math.pi * t)
        _key(rig, f, "chest", rot=(0.025 * s, 0, 0))
        _key(rig, f, "head", rot=(-0.02 * s, 0, 0.01 * math.sin(2 * math.pi * t + 1)))
        _key(rig, f, "upper_arm.L", rot=(0.03 * s, 0, 0.04))
        _key(rig, f, "upper_arm.R", rot=(0.03 * s, 0, -0.04))
        _key(rig, f, "hips", loc=(0, 0, 0.006 * s))
    return _cycle(rig, "idle", 90, 15, pose)


def _gait(rig, name, length, swing, arm_swing, knee, bob, lean):
    def pose(rig, f, t):
        s = math.sin(2 * math.pi * t)
        c = math.cos(2 * math.pi * t)
        _key(rig, f, "thigh.L", rot=(swing * s, 0, 0))
        _key(rig, f, "thigh.R", rot=(-swing * s, 0, 0))
        # knee bends as the leg swings back/through
        _key(rig, f, "shin.L", rot=(-knee * max(0.0, -c), 0, 0))
        _key(rig, f, "shin.R", rot=(-knee * max(0.0, c), 0, 0))
        _key(rig, f, "foot.L", rot=(0.3 * swing * s, 0, 0))
        _key(rig, f, "foot.R", rot=(-0.3 * swing * s, 0, 0))
        _key(rig, f, "upper_arm.L", rot=(-arm_swing * s, 0, 0.05))
        _key(rig, f, "upper_arm.R", rot=(arm_swing * s, 0, -0.05))
        _key(rig, f, "forearm.L", rot=(-0.3 * arm_swing * (1 + s) / 2, 0, 0))
        _key(rig, f, "forearm.R", rot=(-0.3 * arm_swing * (1 - s) / 2, 0, 0))
        _key(rig, f, "chest", rot=(lean, 0, -0.05 * s))
        _key(rig, f, "hips", loc=(0, 0, -bob * abs(c)))
    return _cycle(rig, name, length, max(2, length // 8), pose)


def build_walk(rig):
    return _gait(rig, "walk", 30, swing=0.55, arm_swing=0.35, knee=0.8, bob=0.025, lean=0.04)


def build_run(rig):
    return _gait(rig, "run", 18, swing=0.95, arm_swing=0.75, knee=1.25, bob=0.05, lean=0.18)


def build_all(rig):
    bpy.context.scene.render.fps = FPS
    acts = [build_idle(rig), build_walk(rig), build_run(rig)]
    # push every clip to its own NLA track so the glTF exporter emits them all
    ad = rig.animation_data
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for act in acts:
        track = ad.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 0, act)
    return acts
