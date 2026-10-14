"""Shared helpers for WORLD asset generators.

Contract: every generator module exposes  generate(params: dict, seed: int)
returning a single bpy Object, deterministic in (params, seed). Item NFT
metadata stores (generator, params, seed), so the model must be reproducible
from those three values alone.

Style guide enforced here: flat shading, one palette texture per category,
faces UV-mapped to a single palette point (v = band, u = brightness).
"""
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

# Must match the band order in palette/palette.py (a stable contract).
ROWS = {
    name: i
    for i, name in enumerate(
        [
            "copper", "iron", "steel", "mithril", "adamant", "runic",
            "wood", "leather", "grip", "accent", "bone", "cloth",
            "gold", "stone", "gem", "white",
        ]
    )
}
BANDS = 16

TIERS = ["copper", "iron", "steel", "mithril", "adamant", "runic"]


def repo_root() -> str:
    if "WORLD_REPO" in os.environ:
        return os.environ["WORLD_REPO"]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def rng(seed: int, *mix) -> random.Random:
    """Deterministic RNG; mix extra values in so sub-parts decorrelate."""
    return random.Random((seed, *mix).__repr__())


def palette_image(category: str = "gear") -> bpy.types.Image:
    name = f"palette_{category}"
    img = bpy.data.images.get(name)
    path = os.path.join(repo_root(), "assets", "out", "palettes", f"{category}.png")
    if img is None:
        img = bpy.data.images.load(path)
        img.name = name
    return img


def mr_image(category: str = "gear") -> bpy.types.Image:
    """Metallic/roughness atlas (G=rough, B=metal), baked by palette/pbr.py."""
    name = f"mr_{category}"
    img = bpy.data.images.get(name)
    path = os.path.join(repo_root(), "assets", "out", "palettes", f"{category}_mr.png")
    if img is None and os.path.exists(path):
        img = bpy.data.images.load(path)
        img.name = name
        img.colorspace_settings.name = "Non-Color"
    return img


def palette_material(category: str = "gear") -> bpy.types.Material:
    name = f"WORLD_{category}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.75

    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = palette_image(category)
    tex.location = (-520, 240)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    # metallic/roughness atlas -> Separate Color -> Principled (glTF-canonical,
    # so the exporter emits a metallicRoughnessTexture automatically)
    mr = mr_image(category)
    if mr is not None:
        mtex = nt.nodes.new("ShaderNodeTexImage")
        mtex.image = mr
        mtex.location = (-520, -120)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (-240, -120)
        nt.links.new(mtex.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    return mat


def uv_point(row_name: str, t: float):
    """UV coords for one palette sample. t: 0 dark .. 1 light."""
    v = (ROWS[row_name] + 0.5) / BANDS  # palette row 0 is the image bottom, same as UV v=0
    u = 0.02 + 0.96 * max(0.0, min(1.0, t))
    return (u, v)


def paint_faces(bm: bmesh.types.BMesh, faces, row_name: str, t: float):
    """Map every loop of the given faces to one palette point (flat color)."""
    uv_layer = bm.loops.layers.uv.verify()
    uv = uv_point(row_name, t)
    for f in faces:
        for loop in f.loops:
            loop[uv_layer].uv = uv


def finish_object(name: str, bm: bmesh.types.BMesh, category: str = "gear", smooth: bool = False) -> bpy.types.Object:
    """Finalize: shading, palette material, linked to scene."""
    for f in bm.faces:
        f.smooth = smooth
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(palette_material(category))
    bpy.context.collection.objects.link(obj)
    return obj


def face_material(race: str, sex: str) -> bpy.types.Material:
    """Material sampling a painted face texture (real UVs, not palette)."""
    name = f"FACE_{race}_{sex}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    path = os.path.join(repo_root(), "assets", "out", "faces", f"face_{race}_{sex}.png")
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.6
    tex = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.get(f"facetex_{race}_{sex}")
    if img is None and os.path.exists(path):
        img = bpy.data.images.load(path)
        img.name = f"facetex_{race}_{sex}"
    tex.image = img
    tex.location = (-320, 240)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---- bmesh building blocks -------------------------------------------------

def add_prism(bm, profile, z0, z1, scale_top=1.0, offset_top=(0.0, 0.0)):
    """Extrude a 2D profile [(x, y), ...] from z0 to z1. Returns (faces, bottom_verts, top_verts)."""
    bot = [bm.verts.new((x, y, z0)) for x, y in profile]
    top = [
        bm.verts.new((x * scale_top + offset_top[0], y * scale_top + offset_top[1], z1))
        for x, y in profile
    ]
    n = len(profile)
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
    faces.append(bm.faces.new(tuple(reversed(bot))))
    faces.append(bm.faces.new(tuple(top)))
    return faces, bot, top


def add_box(bm, center, size):
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    profile = [(-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)]
    faces, bot, top = add_prism(
        bm, [(cx + x, cy + y) for x, y in profile], cz - sz, cz + sz
    )
    return faces


def ngon_profile(radius, n=8, squash_y=1.0, rot=0.0):
    import math

    return [
        (
            radius * math.cos(rot + 2 * math.pi * i / n),
            radius * squash_y * math.sin(rot + 2 * math.pi * i / n),
        )
        for i in range(n)
    ]


def spin_to_point(bm, ring_verts, tip):
    """Cap a vertex ring with triangles converging on a tip point."""
    tipv = bm.verts.new(tip)
    faces = []
    n = len(ring_verts)
    for i in range(n):
        faces.append(bm.faces.new((ring_verts[i], ring_verts[(i + 1) % n], tipv)))
    return faces


def tri_count(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
