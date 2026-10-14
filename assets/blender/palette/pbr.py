"""Metallic/roughness atlas for the gear palette.

Each palette row gets a metalness + roughness so metals read as metal, gems
shine, cloth/skin stay matte — the stylized hand-painted PBR look. Aligned
to the SAME 16 rows as palette.py, so a face already UV-mapped to its row
samples the right material automatically.

glTF packs roughness in G and metallic in B; we write exactly that, and
common.palette_material wires Separate Color -> Principled so the glTF
exporter emits a metallicRoughnessTexture with no per-asset work.

Output: <repo>/assets/out/palettes/gear_mr.png
"""
import os

import bpy

SIZE = 256
BANDS = 16
BAND_PX = SIZE // BANDS

# row -> (metallic, roughness) in the same order as palette.GEAR_BANDS
MR = [
    (1.0, 0.45),  # copper
    (1.0, 0.50),  # iron
    (1.0, 0.35),  # steel
    (1.0, 0.28),  # mithril
    (1.0, 0.30),  # adamant
    (1.0, 0.24),  # runic
    (0.0, 0.82),  # wood
    (0.0, 0.76),  # leather
    (0.0, 0.70),  # grip
    (1.0, 0.40),  # accent (brass)
    (0.0, 0.62),  # bone
    (0.0, 0.88),  # cloth
    (1.0, 0.32),  # gold
    (0.0, 0.86),  # stone
    (0.7, 0.14),  # gem (shiny)
    (0.0, 0.70),  # white
]


def repo_root() -> str:
    if "WORLD_REPO" in os.environ:
        return os.environ["WORLD_REPO"]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def build_mr(name: str = "gear_mr") -> str:
    px = [0.0] * (SIZE * SIZE * 4)
    for row in range(SIZE):
        band = min(row // BAND_PX, len(MR) - 1)
        metal, rough = MR[band]
        for col in range(SIZE):
            i = (row * SIZE + col) * 4
            px[i] = 1.0       # R: occlusion/unused (ORM-friendly)
            px[i + 1] = rough  # G: roughness
            px[i + 2] = metal  # B: metallic
            px[i + 3] = 1.0

    img = bpy.data.images.get(name) or bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels[:] = px
    out_dir = os.path.join(repo_root(), "assets", "out", "palettes")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


if __name__ == "__main__":
    print(build_mr())
