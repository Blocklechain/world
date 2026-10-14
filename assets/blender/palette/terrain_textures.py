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


def _save(name: str, rgb: np.ndarray, non_color: bool = False):
    rgb = np.clip(rgb, 0, 1)
    rgba = np.concatenate([rgb, np.ones((SIZE, SIZE, 1), np.float32)], axis=2)
    img = bpy.data.images.get(name) or bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    out_dir = os.path.join(repo_root(), "assets", "out", "terrain")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


def _normal_from_height(height: np.ndarray, strength: float = 2.0) -> np.ndarray:
    """Tangent-space normal map from a tileable height field (wrapping sobel)."""
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    nz = np.ones_like(height)
    length = np.sqrt(gx * gx + gy * gy + nz * nz)
    n = np.stack([-gx / length, -gy / length, nz / length], axis=2)
    return n * 0.5 + 0.5  # encode to 0..1


def grass():
    base = _fbm(11)
    patch = _fbm(23, (8, 16, 32))
    clump = _fbm(13, (16, 32, 64, 128))         # blade clumps
    speck = _value_noise(512, 31)
    blades = np.abs(np.sin(_value_noise(256, 33) * 40)) ** 3  # fine blade streaks
    col = _mix((0.17, 0.30, 0.10), (0.40, 0.56, 0.22), base)
    col = _mix(col, (0.47, 0.52, 0.20), np.clip(patch - 0.45, 0, 1) * 1.6)  # dry patches
    col = _mix(col, (0.22, 0.38, 0.14), clump * 0.5)
    col += (speck[..., None] - 0.5) * 0.09
    col -= (blades[..., None]) * 0.06
    h = base * 0.5 + clump * 0.5 + blades * 0.3
    _save("grass_n", _normal_from_height(h, 2.4), non_color=True)
    return _save("grass", col)


def dirt():
    base = _fbm(41)
    clods = _fbm(45, (16, 32, 64))
    pebbles = np.clip(_value_noise(256, 43) - 0.70, 0, 1) * 3.0
    cracks = np.clip(0.1 - np.abs(_fbm(47, (16, 32)) - 0.5) * 2, 0, 1) * 4
    col = _mix((0.27, 0.19, 0.12), (0.48, 0.37, 0.24), base)
    col = _mix(col, (0.56, 0.50, 0.42), pebbles)
    col = _mix(col, (0.18, 0.13, 0.09), np.clip(cracks, 0, 1))
    col += (_value_noise(512, 49)[..., None] - 0.5) * 0.06
    h = base * 0.4 + clods * 0.5 + pebbles * 0.6 - np.clip(cracks, 0, 1) * 0.5
    _save("dirt_n", _normal_from_height(h, 2.8), non_color=True)
    return _save("dirt", col)


def rock():
    base = _fbm(61)
    strata = (np.sin(_fbm(63, (8, 16)) * 22) * 0.5 + 0.5)  # layered strata
    cracks = np.abs(_fbm(67, (16, 32, 64)) - 0.5) * 2
    crackline = np.clip(0.12 - cracks, 0, 1) * 6.0
    col = _mix((0.33, 0.33, 0.31), (0.60, 0.59, 0.56), base)
    col = _mix(col, (0.42, 0.41, 0.38), strata * 0.4)
    col = _mix(col, (0.16, 0.15, 0.14), np.clip(crackline, 0, 1))
    col += (_value_noise(512, 71)[..., None] - 0.5) * 0.07
    h = base * 0.5 + strata * 0.3 - np.clip(crackline, 0, 1) * 0.9
    _save("rock_n", _normal_from_height(h, 3.6), non_color=True)
    return _save("rock", col)


def marsh():
    base = _fbm(81)
    wet = np.clip(_fbm(83, (8, 16)) - 0.5, 0, 1) * 2
    moss = _fbm(85, (32, 64))
    col = _mix((0.16, 0.22, 0.10), (0.33, 0.35, 0.17), base)
    col = _mix(col, (0.10, 0.15, 0.12), wet)  # dark wet pools
    col = _mix(col, (0.26, 0.34, 0.16), moss * 0.4)
    col += (_value_noise(512, 89)[..., None] - 0.5) * 0.08
    h = base * 0.5 + moss * 0.4 - wet * 0.3
    _save("marsh_n", _normal_from_height(h, 2.0), non_color=True)
    return _save("marsh", col)


def sand():
    base = _fbm(101)
    ripples = np.abs(np.sin(_fbm(103, (8, 16, 32)) * 14.0)) ** 2
    grains = _value_noise(512, 109)
    col = _mix((0.60, 0.53, 0.38), (0.80, 0.72, 0.54), base)
    col = _mix(col, (0.54, 0.47, 0.34), ripples * 0.4)
    col += (grains[..., None] - 0.5) * 0.07
    h = base * 0.3 + ripples * 0.6
    _save("sand_n", _normal_from_height(h, 2.0), non_color=True)
    return _save("sand", col)


def clouds():
    """Soft cumulus billboard sheet with alpha."""
    base = _fbm(301, (4, 8, 16, 32), gain=0.6)
    body = np.clip((base - 0.52) * 3.2, 0, 1)
    soft = np.clip((base - 0.45) * 1.6, 0, 1) * 0.5
    a = np.clip(body + soft, 0, 1) ** 1.3
    # fade edges so billboards never show seams
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE
    edge = np.clip((0.5 - np.abs(xx - 0.5)) * 6, 0, 1) * np.clip((0.5 - np.abs(yy - 0.5)) * 6, 0, 1)
    a *= edge
    shade = 0.82 + 0.18 * _fbm(307, (8, 16))
    rgba = np.stack([shade, shade, shade * 1.02, a], axis=2).astype(np.float32)
    img = bpy.data.images.get("clouds") or bpy.data.images.new("clouds", SIZE, SIZE, alpha=True)
    img.pixels.foreach_set(np.clip(rgba, 0, 1).ravel())
    out_dir = os.path.join(repo_root(), "assets", "out", "terrain")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "clouds.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


def build_all():
    return [grass(), dirt(), rock(), marsh(), sand()]


if __name__ == "__main__":
    print(build_all())
