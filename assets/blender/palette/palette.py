"""Gradient palette textures for WORLD.

One 256x256 texture per asset category. The texture is 16 horizontal bands
(rows) of 16px each; every band is a left-to-right gradient from a dark shade
of the band's base color to a light one. Generators UV-map each face to a
single point inside a band: v picks the material, u picks the brightness.

Run inside Blender:  exec via Blender MCP, or  blender -b -P palette.py
Output: <repo>/assets/out/palettes/<category>.png
"""
import os

import bpy

SIZE = 256
BANDS = 16
BAND_PX = SIZE // BANDS

# Band order is a stable contract: generators reference bands by name through
# common.ROWS, and shipped NFTs reproduce their model from (generator, params,
# seed) — so bands may be ADDED but never reordered or repurposed.
GEAR_BANDS = [
    # six material tiers, in progression order (readable tier color)
    ("copper",  (0.72, 0.45, 0.20)),
    ("iron",    (0.54, 0.56, 0.58)),
    ("steel",   (0.72, 0.76, 0.80)),
    ("mithril", (0.36, 0.50, 0.83)),
    ("adamant", (0.24, 0.56, 0.35)),
    ("runic",   (0.48, 0.31, 0.82)),
    # common accessory materials
    ("wood",    (0.45, 0.30, 0.17)),
    ("leather", (0.42, 0.26, 0.15)),
    ("grip",    (0.25, 0.15, 0.10)),
    ("accent",  (0.83, 0.68, 0.21)),  # brass / gold trim
    ("bone",    (0.85, 0.80, 0.68)),
    ("cloth",   (0.55, 0.12, 0.14)),  # kingdom red
    ("gold",    (0.90, 0.72, 0.16)),
    ("stone",   (0.48, 0.47, 0.44)),
    ("gem",     (0.16, 0.75, 0.78)),
    ("white",   (0.92, 0.92, 0.92)),
]


def repo_root() -> str:
    if "WORLD_REPO" in os.environ:
        return os.environ["WORLD_REPO"]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _shade(base, t):
    """Gradient sample: t=0 darkest, t=1 lightest."""
    dark = tuple(c * 0.30 for c in base)
    light = tuple(c + (1.0 - c) * 0.35 for c in base)
    return tuple(d + (l - d) * t for d, l in zip(dark, light))


def build_palette(name: str, bands) -> str:
    assert len(bands) <= BANDS
    px = [0.0] * (SIZE * SIZE * 4)
    for row in range(SIZE):
        band_i = min(row // BAND_PX, len(bands) - 1)
        base = bands[band_i][1]
        for col in range(SIZE):
            r, g, b = _shade(base, col / (SIZE - 1))
            i = (row * SIZE + col) * 4
            px[i : i + 4] = [r, g, b, 1.0]

    img = bpy.data.images.get(name) or bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.pixels[:] = px

    out_dir = os.path.join(repo_root(), "assets", "out", "palettes")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


if __name__ == "__main__":
    print(build_palette("gear", GEAR_BANDS))
