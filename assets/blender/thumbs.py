"""256x256 alpha-PNG thumbnails for WORLD items.

render_thumb(obj, rel_path) -> <repo>/assets/out/thumbs/<rel_path>.png
Three-quarter view, transparent film, neutral key light. All scene settings
are restored afterwards so thumbnailing never disturbs the working scene.
"""
import math
import os

import bpy
from mathutils import Vector

try:
    import common
except ImportError:
    from generators import common


def _pick_engine(scene):
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            pass  # keep current


def render_thumb(obj: bpy.types.Object, rel_path: str, size: int = 256) -> str:
    scene = bpy.context.scene
    saved = (
        scene.camera,
        scene.render.engine,
        scene.render.film_transparent,
        tuple(scene.render.resolution_x for _ in range(1)),
        scene.render.resolution_y,
        scene.render.filepath,
        scene.render.resolution_percentage,
    )

    # frame the object from a three-quarter angle
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    center = sum(bb, Vector()) / 8
    radius = max((p - center).length for p in bb)
    direction = Vector((1.0, -1.0, 0.55)).normalized()
    cam_data = bpy.data.cameras.new("_thumb_cam")
    cam = bpy.data.objects.new("_thumb_cam", cam_data)
    cam.location = center + direction * radius * 2.6
    look = center - cam.location
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)

    sun_data = bpy.data.lights.new("_thumb_sun", type="SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("_thumb_sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))
    scene.collection.objects.link(sun)

    out = os.path.join(common.repo_root(), "assets", "out", "thumbs", rel_path + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)

    hidden = []
    for o in scene.objects:
        if o not in (obj, cam, sun) and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    try:
        scene.camera = cam
        _pick_engine(scene)
        scene.render.film_transparent = True
        scene.render.resolution_x = size
        scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
    finally:
        for o in hidden:
            o.hide_render = False
        scene.camera = saved[0]
        try:
            scene.render.engine = saved[1]
        except TypeError:
            pass
        scene.render.film_transparent = saved[2]
        scene.render.resolution_x = saved[3][0]
        scene.render.resolution_y = saved[4]
        scene.render.filepath = saved[5]
        scene.render.resolution_percentage = saved[6]
        bpy.data.objects.remove(cam)
        bpy.data.objects.remove(sun)
        bpy.data.cameras.remove(cam_data)
        bpy.data.lights.remove(sun_data)
    return out
