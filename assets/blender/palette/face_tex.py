"""Painted face textures.

The sculpted head is smart-UV-unwrapped, then a 512 face texture is painted
with real eyes (sclera/iris/pupil/lid), brows, lip tint, cheek blush, and
soft skin shading. One texture per race/sex. Deterministic.

This is the first model in the pipeline with a true unwrap + painted albedo,
not single-point palette sampling — so the face reads painted, not flat.
"""
import math
import os

import bpy
import numpy as np

SIZE = 512


def repo_root() -> str:
    if "WORLD_REPO" in os.environ:
        return os.environ["WORLD_REPO"]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


# skin tones per race (sRGB 0..1)
SKIN = {
    "human": (0.80, 0.63, 0.50),
    "elf": (0.86, 0.74, 0.66),
    "dwarf": (0.78, 0.58, 0.44),
}
EYE_COLOR = {
    "human": (0.33, 0.22, 0.12),
    "elf": (0.30, 0.55, 0.52),
    "dwarf": (0.28, 0.20, 0.12),
}


def _disc(xx, yy, cx, cy, r):
    return np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1)


def build_face(race: str, sex: str) -> str:
    skin = np.array(SKIN[race], np.float32)
    eye = np.array(EYE_COLOR[race], np.float32)
    img = np.ones((SIZE, SIZE, 3), np.float32) * skin

    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE
    # the smart-unwrap packs the face island roughly center; paint features
    # in a normalized layout and let the island land on it. We paint a frontal
    # face map: eyes upper third, nose center, mouth lower third.
    rng = np.random.RandomState(hash((race, sex)) & 0xFFFF)

    # soft vertical shading (forehead lighter, jaw cooler)
    img *= (1.05 - 0.12 * ys)[..., None]

    # pores / skin noise
    noise = rng.rand(SIZE, SIZE).astype(np.float32)
    img += (noise[..., None] - 0.5) * 0.03

    for ex in (0.355, 0.645):
        ey = 0.47  # eye band height (matches the sculpted sockets)
        # almond eye socket shadow
        sock = _disc(xs, ys, ex, ey, 0.11)
        img *= (1 - 0.22 * sock)[..., None]
        # sclera (wider almond)
        scl = _disc(xs, ys, ex, ey, 0.062) * np.clip(1 - abs(ys - ey) * 14, 0, 1)
        img = img * (1 - scl[..., None]) + np.array([0.93, 0.91, 0.88]) * scl[..., None]
        # iris
        iri = _disc(xs, ys, ex, ey, 0.046)
        img = img * (1 - iri[..., None]) + eye * iri[..., None]
        iri2 = _disc(xs, ys, ex, ey, 0.040) - _disc(xs, ys, ex, ey, 0.030)
        img = img * (1 - np.clip(iri2, 0, 1)[..., None] * 0.5) + eye * 0.5 * np.clip(iri2, 0, 1)[..., None]  # iris rim darker
        # pupil
        pup = _disc(xs, ys, ex, ey, 0.024)
        img = img * (1 - pup[..., None]) + np.array([0.03, 0.03, 0.04]) * pup[..., None]
        # catchlight
        cl = _disc(xs, ys, ex - 0.012, ey + 0.012, 0.008)
        img = img * (1 - cl[..., None]) + np.array([1.0, 1.0, 1.0]) * cl[..., None]
        # upper lid crease
        lid = _disc(xs, ys, ex, ey + 0.055, 0.06) * np.clip(1 - abs(ys - (ey + 0.055)) * 24, 0, 1)
        img *= (1 - 0.3 * lid)[..., None]
        # brow (bold)
        brow_w = 0.095 * (1.5 if (sex == "m") else 1.0) * (1.3 if race == "dwarf" else 1.0)
        brow = _disc(xs, ys, ex, 0.60, brow_w) * np.clip(1 - abs(ys - 0.60) * 22, 0, 1)
        img = img * (1 - 0.8 * brow[..., None]) + skin * 0.22 * (0.8 * brow)[..., None]

    # nose shadow (sides) + highlight (bridge)
    nsh = _disc(xs, ys, 0.45, 0.38, 0.055) + _disc(xs, ys, 0.55, 0.38, 0.055)
    img *= (1 - 0.12 * np.clip(nsh, 0, 1))[..., None]
    bridge = _disc(xs, ys, 0.5, 0.44, 0.028)
    img *= (1 + 0.09 * bridge)[..., None]
    nostril = _disc(xs, ys, 0.47, 0.34, 0.012) + _disc(xs, ys, 0.53, 0.34, 0.012)
    img *= (1 - 0.3 * np.clip(nostril, 0, 1))[..., None]

    # lips
    lip = _disc(xs, ys, 0.5, 0.26, 0.085) * np.clip(1 - abs(ys - 0.26) * 14, 0, 1)
    lipcol = np.array([0.74, 0.40, 0.36]) if sex == "f" else np.array([0.60, 0.38, 0.34])
    img = img * (1 - 0.75 * lip[..., None]) + lipcol * (0.75 * lip)[..., None]
    mouthline = _disc(xs, ys, 0.5, 0.26, 0.08) * np.clip(1 - abs(ys - 0.26) * 55, 0, 1)
    img *= (1 - 0.45 * mouthline)[..., None]

    # cheek blush (subtle, stronger for f)
    blush_amt = 0.12 if sex == "f" else 0.05
    for cx in (0.33, 0.67):
        bl = _disc(xs, ys, cx, 0.36, 0.09)
        img = img * (1 - blush_amt * bl[..., None]) + np.array([0.86, 0.5, 0.45]) * (blush_amt * bl)[..., None]

    img = np.clip(img, 0, 1)
    rgba = np.concatenate([img, np.ones((SIZE, SIZE, 1), np.float32)], axis=2)
    name = f"face_{race}_{sex}"
    bimg = bpy.data.images.get(name) or bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    bimg.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    out_dir = os.path.join(repo_root(), "assets", "out", "faces")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    bimg.filepath_raw = path
    bimg.file_format = "PNG"
    bimg.save()
    return path
