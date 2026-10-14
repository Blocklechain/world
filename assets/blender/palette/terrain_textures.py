"""Procedural tileable terrain textures (grass, dirt, rock, marsh).

1024x1024, generated with numpy value-noise whose lattice sizes all divide the
texture size — tileable by construction. The terrain splat-blends these four
by biome weights. Scripts-only assets, per the project rule.

Output: <repo>/assets/out/terrain/<name>.png
"""
import os

import bpy
import numpy as np

SIZE = 1024


def repo_root() -> str:
    if "WORLD_REPO" in os.environ:
        return os.environ["WORLD_REPO"]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _smooth(t):
    return t * t * (3 - 2 * t)


def _value_noise(lattice: int, seed: int) -> np.ndarray:
    """Tileable value noise upsampled from a wrapping lattice."""
    rs = np.random.RandomState(seed)
    g = rs.rand(lattice, lattice).astype(np.float32)
    scale = SIZE // lattice
    # coordinates within each cell
    f = _smooth(np.linspace(0, 1, scale, endpoint=False, dtype=np.float32))
    fx = np.tile(f, lattice)[None, :]
    fz = np.tile(f, lattice)[:, None]
    a = np.repeat(np.repeat(g, scale, 0), scale, 1)
    b = np.repeat(np.repeat(np.roll(g, -1, 1), scale, 0), scale, 1)
    c = np.repeat(np.repeat(np.roll(g, -1, 0), scale, 0), scale, 1)
    d = np.repeat(np.repeat(np.roll(np.roll(g, -1, 0), -1, 1), scale, 0), scale, 1)
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz


def _fbm(seed: int, lattices=(8, 16, 32, 64, 128, 256), gain=0.55) -> np.ndarray:
    out = np.zeros((SIZE, SIZE), np.float32)
    amp = 1.0
    norm = 0.0
    for i, lat in enumerate(lattices):
        out += amp * _value_noise(lat, seed + i * 7919)
        norm += amp
        amp *= gain
    return out / norm


def _mix(c0, c1, t):
    t = t[..., None]
    return np.asarray(c0, np.float32) * (1 - t) + np.asarray(c1, np.float32) * t


def _save(name: str, rgb: np.ndarray):
    rgb = np.clip(rgb, 0, 1)
    rgba = np.concatenate([rgb, np.ones((SIZE, SIZE, 1), np.float32)], axis=2)
    img = bpy.data.images.get(name) or bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    out_dir = os.path.join(repo_root(), "assets", "out", "terrain")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


def grass():
    base = _fbm(11)
    patch = _fbm(23, (8, 16, 32))
    speck = _value_noise(512, 31)
    col = _mix((0.22, 0.34, 0.14), (0.38, 0.52, 0.22), base)
    col = _mix(col, (0.45, 0.50, 0.20), np.clip(patch - 0.45, 0, 1) * 1.4)  # dry patches
    col += (speck[..., None] - 0.5) * 0.10  # blade speckle
    return _save("grass", col)


def dirt():
    base = _fbm(41)
    pebbles = np.clip(_value_noise(256, 43) - 0.72, 0, 1) * 3.0
    col = _mix((0.30, 0.22, 0.14), (0.46, 0.35, 0.22), base)
    col = _mix(col, (0.52, 0.47, 0.40), pebbles)
    col += (_value_noise(512, 47)[..., None] - 0.5) * 0.06
    return _save("dirt", col)


def rock():
    base = _fbm(61)
    cracks = np.abs(_fbm(67, (16, 32, 64)) - 0.5) * 2
    crackline = np.clip(0.14 - cracks, 0, 1) * 5.0
    col = _mix((0.40, 0.39, 0.37), (0.58, 0.57, 0.54), base)
    col = _mix(col, (0.22, 0.21, 0.20), np.clip(crackline, 0, 1))
    col += (_value_noise(512, 71)[..., None] - 0.5) * 0.07
    return _save("rock", col)


def marsh():
    base = _fbm(81)
    wet = np.clip(_fbm(83, (8, 16)) - 0.5, 0, 1) * 2
    col = _mix((0.20, 0.24, 0.12), (0.33, 0.34, 0.16), base)
    col = _mix(col, (0.14, 0.18, 0.14), wet)  # dark wet pools
    col += (_value_noise(512, 89)[..., None] - 0.5) * 0.08
    return _save("marsh", col)


def build_all():
    return [grass(), dirt(), rock(), marsh()]


if __name__ == "__main__":
    print(build_all())
