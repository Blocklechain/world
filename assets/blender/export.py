"""GLB export for WORLD assets.

export_glb(obj, rel_dir, name=None) writes <repo>/assets/out/<rel_dir>/<name>.glb
containing only that object, Y-up, transforms applied. gltfpack/meshopt
compression happens in the client asset build; committed GLBs are the source.
"""
import os

import bpy

try:
    import common
except ImportError:
    from generators import common


def export_glb(obj: bpy.types.Object, rel_dir: str, name: str | None = None) -> str:
    out_dir = os.path.join(common.repo_root(), "assets", "out", rel_dir)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, (name or obj.name) + ".glb")

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    return path
