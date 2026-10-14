"""World props: trees, ore rocks, gatherables, town and scenery pieces.

Everything samples the shared GEAR palette (one material world-wide keeps the
whole overworld at minimal draw calls; foliage greens ride the adamant/gem
bands, ores ride their tier bands).

Each species is one mesh, origin at ground level, authored at scale 1.
build_all() regenerates and exports every GLB under assets/out/nature/.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

try:
    import common
except ImportError:
    from . import common


def _blob(bm, center, radius, squash, rng, jitter=0.25, subdiv=1):
    """Organic low-poly blob: jittered icosphere."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    verts = res["verts"]
    for v in verts:
        n = (v.co - Vector((0, 0, 0))).normalized()
        v.co += n * (rng.uniform(-jitter, jitter) * radius)
        v.co.z *= squash
        v.co += Vector(center)
    return [f for f in bm.faces if any(v in verts for v in f.verts)]


def _trunk(bm, rng, height, r0, r1, bend=0.25, n=6):
    rings = []
    segs = 3
    bx = rng.uniform(-bend, bend)
    by = rng.uniform(-bend, bend)
    for i in range(segs + 1):
        t = i / segs
        r = r0 + (r1 - r0) * t
        cx = bx * t * t * height
        cy = by * t * t * height
        ring = [
            bm.verts.new((cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), t * height))
            for k in range(n)
        ]
        rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            faces.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
    faces.append(bm.faces.new(tuple(reversed(rings[0]))))
    faces.append(bm.faces.new(tuple(rings[-1])))
    top = Vector((bx * height, by * height, height))
    return faces, top


def _finish(name, bm):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    return common.finish_object(name, bm)


# ---- trees -----------------------------------------------------------------

TREES = {
    #            trunk_row  canopy_row  canopy_t  height  droop
    "alderwood": ("wood", "adamant", 0.55, 3.4, False),
    "emberbirch": ("bone", "accent", 0.55, 4.2, False),
    "silverwillow": ("stone", "gem", 0.7, 4.6, True),
    "duskyew": ("grip", "runic", 0.45, 5.0, False),
}


def tree(species: str, seed: int = 0):
    trunk_row, canopy_row, canopy_t, height, droop = TREES[species]
    r = common.rng(seed, "tree", species)
    bm = bmesh.new()
    # trunk with a root flare, plus 2 branch stubs reaching into the canopy
    tf, top = _trunk(bm, r, height * 0.52, 0.26, 0.11)
    common.paint_faces(bm, tf, trunk_row, 0.4)
    for i in range(2):
        ang = r.uniform(0, math.tau)
        base = top + Vector((0, 0, -height * 0.12))
        tip = base + Vector((math.cos(ang) * height * 0.22, math.sin(ang) * height * 0.22, height * 0.16))
        mid = (base + tip) / 2
        bf = _blob(bm, mid, height * 0.045, (tip - base).length / (height * 0.09), r, jitter=0.1)
        common.paint_faces(bm, bf, trunk_row, 0.5)
    # layered canopy: a big crown with smaller two-tone clusters around it
    blobs = 4 if not droop else 5
    for i in range(blobs):
        big = i == 0
        ang = r.uniform(0, math.tau)
        d = 0 if big else r.uniform(0.3, 0.8) * height * 0.22
        lift = height * (0.3 if big else r.uniform(0.12, 0.34))
        if droop:
            lift -= height * 0.1 * (0 if big else 1)
        c = top + Vector((math.cos(ang) * d, math.sin(ang) * d, lift))
        radius = height * (r.uniform(0.24, 0.3) if big else r.uniform(0.13, 0.19))
        squash = 0.72 if not droop else 1.3
        bf = _blob(bm, c, radius, squash, r, jitter=0.2, subdiv=2)
        shade = canopy_t + (0.1 if big else r.uniform(-0.16, 0.08))
        common.paint_faces(bm, bf, canopy_row, shade)
    return _finish(f"tree_{species}", bm)


def grass_tuft(seed: int = 0):
    r = common.rng(seed, "grass")
    bm = bmesh.new()
    for i in range(7):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0, 0.3)
        h = r.uniform(0.25, 0.5)
        x, y = math.cos(ang) * d, math.sin(ang) * d
        lean = r.uniform(-0.12, 0.12)
        base = [bm.verts.new((x + 0.025 * math.cos(a), y + 0.025 * math.sin(a), 0)) for a in (0, 2.1, 4.2)]
        tip = bm.verts.new((x + lean, y + lean, h))
        faces = [bm.faces.new((base[k], base[(k + 1) % 3], tip)) for k in range(3)]
        common.paint_faces(bm, faces, "adamant", 0.42 + r.uniform(0, 0.25))
    return _finish("grass_tuft", bm)


def stump(seed: int = 0):
    r = common.rng(seed, "stump")
    bm = bmesh.new()
    tf, _ = _trunk(bm, r, 0.45, 0.22, 0.19, bend=0.05)
    common.paint_faces(bm, tf, "wood", 0.45)
    return _finish("tree_stump", bm)


# ---- rocks -----------------------------------------------------------------

ORE_ROWS = {
    "copper_rock": ("copper", 0.6),
    "iron_rock": ("iron", 0.55),
    "coal_rock": ("grip", 0.25),
    "mithril_rock": ("mithril", 0.6),
    "adamant_rock": ("adamant", 0.6),
    "rune_rock": ("runic", 0.65),
}


def ore_rock(species: str, seed: int = 0):
    ore_row, ore_t = ORE_ROWS[species]
    r = common.rng(seed, "rock", species)
    bm = bmesh.new()
    for i in range(3):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0, 0.45)
        radius = r.uniform(0.45, 0.8) * (1.15 if i == 0 else 0.8)
        c = (math.cos(ang) * d, math.sin(ang) * d, radius * 0.45)
        bf = _blob(bm, c, radius, 0.7, r, jitter=0.35, subdiv=2 if i == 0 else 1)
        common.paint_faces(bm, bf, "stone", r.uniform(0.35, 0.55))
    # ore chunks studding the rock
    for i in range(5):
        ang = r.uniform(0, math.tau)
        c = (math.cos(ang) * 0.55, math.sin(ang) * 0.55, r.uniform(0.25, 0.7))
        bf = _blob(bm, c, r.uniform(0.1, 0.17), 1.0, r, jitter=0.2)
        common.paint_faces(bm, bf, ore_row, ore_t + r.uniform(-0.1, 0.1))
    return _finish(species, bm)


def rubble(seed: int = 0):
    r = common.rng(seed, "rubble")
    bm = bmesh.new()
    for i in range(4):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0.1, 0.6)
        bf = _blob(bm, (math.cos(ang) * d, math.sin(ang) * d, 0.1), r.uniform(0.14, 0.26), 0.55, r)
        common.paint_faces(bm, bf, "stone", r.uniform(0.3, 0.45))
    return _finish("rock_rubble", bm)


def boulder(seed: int = 0):
    r = common.rng(seed, "boulder")
    bm = bmesh.new()
    bf = _blob(bm, (0, 0, 0.55), 0.9, 0.75, r, jitter=0.4, subdiv=2)
    common.paint_faces(bm, bf, "stone", 0.42)
    return _finish("boulder", bm)


# ---- gatherable patches ----------------------------------------------------

def reeds(seed: int = 0):
    r = common.rng(seed, "reeds")
    bm = bmesh.new()
    for i in range(9):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0, 0.5)
        h = r.uniform(0.9, 1.6)
        x, y = math.cos(ang) * d, math.sin(ang) * d
        base = [bm.verts.new((x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), 0)) for a in (0, 2.1, 4.2)]
        tip = bm.verts.new((x + r.uniform(-0.1, 0.1), y + r.uniform(-0.1, 0.1), h))
        faces = [bm.faces.new((base[k], base[(k + 1) % 3], tip)) for k in range(3)]
        common.paint_faces(bm, faces, "adamant", 0.3 + r.uniform(0, 0.15))
    return _finish("reeds", bm)


def sunbloom(seed: int = 0):
    r = common.rng(seed, "sunbloom")
    bm = bmesh.new()
    gf = _blob(bm, (0, 0, 0.1), 0.45, 0.35, r)
    common.paint_faces(bm, gf, "adamant", 0.5)
    for i in range(6):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0.1, 0.4)
        c = Vector((math.cos(ang) * d, math.sin(ang) * d, 0.3 + r.uniform(0, 0.1)))
        bf = _blob(bm, c, 0.09, 0.8, r, jitter=0.15)
        common.paint_faces(bm, bf, "gold", 0.7 + r.uniform(0, 0.15))
    return _finish("sunbloom_patch", bm)


def fishing_spot(seed: int = 0):
    """Concentric ripple rings floating on the water surface."""
    bm = bmesh.new()
    n = 16
    for r0, r1, t in ((0.25, 0.34, 0.9), (0.6, 0.68, 0.75), (0.95, 1.01, 0.6)):
        inner = [bm.verts.new((r0 * math.cos(a), r0 * math.sin(a), 0)) for a in [k * math.tau / n for k in range(n)]]
        outer = [bm.verts.new((r1 * math.cos(a), r1 * math.sin(a), 0)) for a in [k * math.tau / n for k in range(n)]]
        faces = [bm.faces.new((inner[i], outer[i], outer[(i + 1) % n], inner[(i + 1) % n])) for i in range(n)]
        common.paint_faces(bm, faces, "white", t)
    return _finish("fishing_spot", bm)


def cave_entrance(seed: int = 0):
    """A dark maw framed by rock, readable from far away."""
    r = common.rng(seed, "cave_entrance")
    bm = bmesh.new()
    # rock frame: boulders arched around the opening (door faces -Y)
    for ang, radius, sq in ((-0.9, 1.0, 0.8), (0.9, 1.0, 0.8), (-0.45, 0.9, 0.9), (0.45, 0.9, 0.9), (0, 0.95, 0.85)):
        x = math.sin(ang) * 1.6
        z = 0.6 + math.cos(ang) * 1.5
        bf = _blob(bm, (x, 0.3, z), radius * 0.8, sq, r, jitter=0.3)
        common.paint_faces(bm, bf, "stone", 0.42)
    # the void
    df = common.add_box(bm, (0, -0.35, 1.0), (1.7, 0.3, 1.9))
    common.paint_faces(bm, df, "grip", 0.04)
    return _finish("cave_entrance", bm)


def stalagmite(seed: int = 0):
    r = common.rng(seed, "stalagmite")
    bm = bmesh.new()
    for i in range(3):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0, 0.45)
        h = r.uniform(0.6, 1.8) * (1.4 if i == 0 else 0.7)
        base_r = h * r.uniform(0.18, 0.26)
        x, y = math.cos(ang) * d, math.sin(ang) * d
        prof = common.ngon_profile(base_r, n=6)
        pf, _, top = common.add_prism(bm, [(x + px, y + py) for px, py in prof], 0, h * 0.75, scale_top=0.35)
        common.paint_faces(bm, pf, "stone", r.uniform(0.32, 0.45))
        tipf = common.spin_to_point(bm, top, (x, y, h))
        common.paint_faces(bm, tipf, "stone", 0.5)
    return _finish("stalagmite", bm)


def glow_crystal(seed: int = 0):
    r = common.rng(seed, "crystal")
    bm = bmesh.new()
    for i in range(4):
        ang = r.uniform(0, math.tau)
        d = r.uniform(0, 0.3)
        h = r.uniform(0.5, 1.1)
        tilt = r.uniform(-0.25, 0.25)
        x, y = math.cos(ang) * d, math.sin(ang) * d
        prof = common.ngon_profile(0.14, n=5)
        pf, _, top = common.add_prism(bm, [(x + px, y + py) for px, py in prof], 0, h * 0.7, scale_top=0.5, offset_top=(tilt, tilt))
        common.paint_faces(bm, pf, "gem", 0.8)
        tipf = common.spin_to_point(bm, top, (x + tilt * 1.4, y + tilt * 1.4, h))
        common.paint_faces(bm, tipf, "gem", 0.95)
    base = _blob(bm, (0, 0, 0.08), 0.4, 0.4, r)
    common.paint_faces(bm, base, "stone", 0.3)
    return _finish("glow_crystal", bm)


def rowboat(seed: int = 0):
    """A weathered wooden rowboat, bow toward -Y, origin at the waterline."""
    bm = bmesh.new()
    # hull: lofted cross-sections bow -> stern
    sections = [
        (-1.5, 0.06, 0.26),   # bow tip
        (-1.0, 0.34, 0.34),
        (-0.2, 0.46, 0.38),
        (0.6, 0.44, 0.36),
        (1.2, 0.3, 0.3),      # stern
    ]
    rings = []
    for y, hw, ht in sections:
        ring = [
            bm.verts.new((-hw, y, ht)),
            bm.verts.new((-hw * 0.7, y, 0.02)),
            bm.verts.new((0, y, -0.06)),
            bm.verts.new((hw * 0.7, y, 0.02)),
            bm.verts.new((hw, y, ht)),
        ]
        rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            faces.append(bm.faces.new((a[i], a[i + 1], b[i + 1], b[i])))
    # bow + stern caps
    faces.append(bm.faces.new(tuple(rings[0])))
    faces.append(bm.faces.new(tuple(reversed(rings[-1]))))
    # inner floor
    fl = common.add_box(bm, (0, -0.1, 0.02), (0.5, 2.3, 0.05))
    common.paint_faces(bm, faces, "wood", 0.42)
    common.paint_faces(bm, fl, "wood", 0.3)
    # bench seats
    for y in (-0.55, 0.45):
        bf = common.add_box(bm, (0, y, 0.18), (0.62, 0.22, 0.05))
        common.paint_faces(bm, bf, "wood", 0.55)
    # gunwale rails along each side
    for sx in (-1, 1):
        tr = common.add_box(bm, (sx * 0.42, -0.15, 0.37), (0.09, 2.5, 0.05))
        common.paint_faces(bm, tr, "grip", 0.4)
    return _finish("rowboat", bm)


# ---- town & scenery --------------------------------------------------------

def _house_core(bm, w, d, h, wall_row, wall_t, roof_row, roof_t):
    """Walls + gable roof + door + windows. Door faces -Y."""
    walls = common.add_box(bm, (0, 0, h / 2), (w, d, h))
    common.paint_faces(bm, walls, wall_row, wall_t)
    # corner beams
    for sx in (-1, 1):
        for sy in (-1, 1):
            bf = common.add_box(bm, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), h / 2), (0.18, 0.18, h))
            common.paint_faces(bm, bf, "wood", 0.35)
    # gable roof: two sloped slabs meeting at a ridge
    rise = h * 0.55
    for sx in (-1, 1):
        slab = common.add_box(bm, (sx * w * 0.26, 0, h + rise / 2), (w * 0.62, d + 0.5, 0.12))
        import bmesh as _b
        verts = set()
        for f in slab:
            for v in f.verts:
                verts.add(v)
        rot = Matrix.Rotation(sx * math.atan2(rise, w * 0.52), 4, "Y")
        _b.ops.rotate(bm, verts=list(verts), cent=(sx * w * 0.26, 0, h + rise / 2), matrix=rot)
        common.paint_faces(bm, slab, roof_row, roof_t)
    gable = common.add_box(bm, (0, 0, h + rise * 0.26), (w * 0.86, d * 0.9, rise * 0.52))
    common.paint_faces(bm, gable, wall_row, wall_t - 0.06)
    # door
    df = common.add_box(bm, (0, -d / 2 - 0.02, 0.95), (0.8, 0.1, 1.9))
    common.paint_faces(bm, df, "grip", 0.35)
    # windows
    for sx in (-1, 1):
        wf = common.add_box(bm, (sx * w * 0.28, -d / 2 - 0.02, 1.5), (0.5, 0.08, 0.5))
        common.paint_faces(bm, wf, "gold", 0.85)


def house(seed: int = 0):
    bm = bmesh.new()
    _house_core(bm, 4.6, 3.8, 2.6, "bone", 0.8, "cloth", 0.55)
    return _finish("house", bm)


def house_stone(seed: int = 0):
    bm = bmesh.new()
    _house_core(bm, 5.2, 4.2, 2.9, "stone", 0.72, "wood", 0.5)
    return _finish("house_stone", bm)


def smithy(seed: int = 0):
    r = common.rng(seed, "smithy")
    bm = bmesh.new()
    _house_core(bm, 5.4, 4.4, 2.7, "stone", 0.6, "wood", 0.45)
    # chimney with embers
    cf = common.add_box(bm, (1.6, 1.2, 4.6), (0.7, 0.7, 2.2))
    common.paint_faces(bm, cf, "stone", 0.35)
    ef = common.add_box(bm, (1.6, 1.2, 5.75), (0.5, 0.5, 0.15))
    common.paint_faces(bm, ef, "copper", 0.9)
    # anvil out front
    af = common.add_box(bm, (-1.4, -2.9, 0.55), (0.8, 0.4, 0.35))
    common.paint_faces(bm, af, "iron", 0.4)
    bf2 = common.add_box(bm, (-1.4, -2.9, 0.2), (0.5, 0.5, 0.4))
    common.paint_faces(bm, bf2, "wood", 0.35)
    return _finish("smithy", bm)


def bank_booth(seed: int = 0):
    bm = bmesh.new()
    counter = common.add_box(bm, (0, 0, 0.55), (2.4, 0.7, 1.1))
    common.paint_faces(bm, counter, "wood", 0.5)
    top = common.add_box(bm, (0, 0, 1.14), (2.6, 0.9, 0.08))
    common.paint_faces(bm, top, "wood", 0.65)
    for sx in (-1.15, 1.15):
        post = common.add_box(bm, (sx, 0, 1.8), (0.12, 0.12, 1.4))
        common.paint_faces(bm, post, "grip", 0.4)
    roof = common.add_box(bm, (0, 0, 2.6), (2.9, 1.3, 0.12))
    common.paint_faces(bm, roof, "cloth", 0.5)
    crest = common.add_box(bm, (0, -0.4, 1.95), (0.5, 0.06, 0.5))
    common.paint_faces(bm, crest, "gold", 0.7)
    return _finish("bank_booth", bm)


def hearth(seed: int = 0):
    r = common.rng(seed, "hearth")
    bm = bmesh.new()
    for i in range(8):
        ang = i / 8 * math.tau
        bf = _blob(bm, (math.cos(ang) * 1.1, math.sin(ang) * 1.1, 0.2), 0.3, 0.7, r)
        common.paint_faces(bm, bf, "stone", 0.45)
    flame = _blob(bm, (0, 0, 0.5), 0.45, 1.5, r, jitter=0.35)
    common.paint_faces(bm, flame, "gold", 0.9)
    ember = _blob(bm, (0, 0, 0.25), 0.55, 0.5, r)
    common.paint_faces(bm, ember, "copper", 0.8)
    return _finish("hearth", bm)


def ruin_pillar(seed: int = 0):
    r = common.rng(seed, "pillar")
    bm = bmesh.new()
    h = r.uniform(1.6, 3.2)
    prof = common.ngon_profile(0.35, n=8)
    pf, _, top = common.add_prism(bm, prof, 0, h, scale_top=0.9)
    common.paint_faces(bm, pf, "stone", 0.55)
    base = common.add_box(bm, (0, 0, 0.15), (1.1, 1.1, 0.3))
    common.paint_faces(bm, base, "stone", 0.4)
    # broken top: jitter the top ring
    for v in top:
        v.co.z += r.uniform(-0.35, 0.05)
    return _finish("ruin_pillar", bm)


def barrow(seed: int = 0):
    r = common.rng(seed, "barrow")
    bm = bmesh.new()
    mound = _blob(bm, (0, 0, 0.3), 1.6, 0.45, r, jitter=0.15)
    common.paint_faces(bm, mound, "leather", 0.35)
    door = common.add_box(bm, (0, -1.3, 0.5), (0.9, 0.2, 1.0))
    common.paint_faces(bm, door, "stone", 0.3)
    return _finish("barrow", bm)


# ---- batch -----------------------------------------------------------------

ALL = {
    "tree_alderwood": lambda: tree("alderwood", 11),
    "tree_emberbirch": lambda: tree("emberbirch", 12),
    "tree_silverwillow": lambda: tree("silverwillow", 13),
    "tree_duskyew": lambda: tree("duskyew", 14),
    "tree_stump": lambda: stump(1),
    "copper_rock": lambda: ore_rock("copper_rock", 21),
    "iron_rock": lambda: ore_rock("iron_rock", 22),
    "coal_rock": lambda: ore_rock("coal_rock", 23),
    "mithril_rock": lambda: ore_rock("mithril_rock", 24),
    "adamant_rock": lambda: ore_rock("adamant_rock", 25),
    "rune_rock": lambda: ore_rock("rune_rock", 26),
    "rock_rubble": lambda: rubble(2),
    "boulder": lambda: boulder(3),
    "reeds": lambda: reeds(4),
    "sunbloom_patch": lambda: sunbloom(5),
    "grass_tuft": lambda: grass_tuft(9),
    "fishing_spot": lambda: fishing_spot(),
    "cave_entrance": lambda: cave_entrance(),
    "rowboat": lambda: rowboat(),
    "stalagmite": lambda: stalagmite(17),
    "glow_crystal": lambda: glow_crystal(18),
    "bank_booth": lambda: bank_booth(),
    "house": lambda: house(),
    "house_stone": lambda: house_stone(),
    "smithy": lambda: smithy(),
    "hearth": lambda: hearth(6),
    "ruin_pillar": lambda: ruin_pillar(7),
    "barrow": lambda: barrow(8),
}


def build_all(export=True):
    import export as exp

    objs = []
    for name, fn in ALL.items():
        o = fn()
        objs.append(o)
        if export:
            exp.export_glb(o, "nature", name)
    return objs
