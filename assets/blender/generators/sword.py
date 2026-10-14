"""Parametric sword generator.

generate(params, seed) -> bpy Object, deterministic.
params:
  tier:    one of common.TIERS (copper..runic) — sets the palette band
  variant: 0 arming sword | 1 broadsword | 2 greatsword  (three silhouettes)

Origin is the grip center (hand point) so the mesh sockets to socket.hand_r.
Blade runs along +Z. Budget: <= 800 tris (actual ~180–260).
"""
import bmesh
import bpy

try:
    import common  # generators/ dir on sys.path (Blender MCP runner)
except ImportError:
    from . import common


VARIANTS = {
    0: dict(name="arming", blade_len=0.74, blade_w=0.030, blade_th=0.007,
            guard_w=0.17, grip_len=0.13, pommel_r=0.028, segments=4),
    1: dict(name="broad", blade_len=0.62, blade_w=0.047, blade_th=0.009,
            guard_w=0.20, grip_len=0.13, pommel_r=0.030, segments=4),
    2: dict(name="great", blade_len=0.98, blade_w=0.036, blade_th=0.009,
            guard_w=0.24, grip_len=0.24, pommel_r=0.034, segments=5),
}


def _loft(bm, rings_spec):
    """rings_spec: [(half_w, half_th, z), ...]. Returns (rings, segment_faces)."""
    rings = []
    for w, th, z in rings_spec:
        rings.append([
            bm.verts.new((w, 0, z)),
            bm.verts.new((0, th, z)),
            bm.verts.new((-w, 0, z)),
            bm.verts.new((0, -th, z)),
        ])
    seg_faces = []
    for a, b in zip(rings, rings[1:]):
        faces = []
        for i in range(4):
            faces.append(bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i])))
        seg_faces.append(faces)
    return rings, seg_faces


def generate(params: dict, seed: int) -> bpy.types.Object:
    tier = params["tier"]
    variant = int(params.get("variant", 0))
    v = VARIANTS[variant]
    r = common.rng(seed, "sword", tier, variant)
    j = lambda a, b: 1.0 + r.uniform(a, b)

    blade_len = v["blade_len"] * j(-0.06, 0.06)
    blade_w = v["blade_w"] * j(-0.08, 0.08)
    blade_th = v["blade_th"]
    guard_w = v["guard_w"] * j(-0.08, 0.08)
    grip_len = v["grip_len"]
    pommel_r = v["pommel_r"]

    bm = bmesh.new()
    z_guard = grip_len / 2 + 0.012

    # --- blade: lofted diamond cross-section, taper then tip -----------------
    nseg = v["segments"]
    rings_spec = []
    for i in range(nseg):
        t = i / (nseg - 1)
        # broadsword bellies out slightly; others taper linearly
        belly = 1.0 + (0.18 * (1 - abs(2 * t - 1)) if variant == 1 else 0.0)
        taper = 1.0 - 0.45 * t
        rings_spec.append((blade_w * taper * belly, blade_th * (1.0 - 0.3 * t),
                           z_guard + blade_len * 0.92 * t))
    rings, seg_faces = _loft(bm, rings_spec)
    bm.faces.new(tuple(reversed(rings[0])))  # base cap (hidden by guard)
    tip_faces = common.spin_to_point(bm, rings[-1], (0, 0, z_guard + blade_len))
    for i, faces in enumerate(seg_faces):
        common.paint_faces(bm, faces, tier, 0.50 + 0.28 * (i / max(1, nseg - 1)))
    common.paint_faces(bm, tip_faces, tier, 0.85)
    common.paint_faces(bm, [f for f in bm.faces if len(f.verts) == 4 and abs(f.calc_center_median().z - rings_spec[0][2]) < 1e-6], tier, 0.5)

    # --- crossguard ----------------------------------------------------------
    if variant == 2:
        guard_faces = common.add_box(bm, (0, 0, z_guard - 0.004), (guard_w, 0.030, 0.030))
        tip_l = common.add_box(bm, (-guard_w / 2, 0, z_guard - 0.004), (0.028, 0.034, 0.044))
        tip_rt = common.add_box(bm, (guard_w / 2, 0, z_guard - 0.004), (0.028, 0.034, 0.044))
        common.paint_faces(bm, tip_l + tip_rt, "accent", 0.6)
    else:
        guard_faces = common.add_box(bm, (0, 0, z_guard - 0.004), (guard_w, 0.026, 0.026))
    common.paint_faces(bm, guard_faces, tier, 0.30)

    # --- grip ----------------------------------------------------------------
    prof = common.ngon_profile(0.015, n=6)
    grip_faces, _, _ = common.add_prism(bm, prof, -grip_len / 2, grip_len / 2)
    common.paint_faces(bm, grip_faces, "grip", 0.45)

    # --- pommel --------------------------------------------------------------
    z_pom = -grip_len / 2 - 0.012
    ring = [bm.verts.new((x, y, z_pom)) for x, y in common.ngon_profile(pommel_r, n=6)]
    pf = common.spin_to_point(bm, ring, (0, 0, z_pom + pommel_r * 0.9))
    pf += common.spin_to_point(bm, list(reversed(ring)), (0, 0, z_pom - pommel_r * 0.9))
    common.paint_faces(bm, pf, "accent" if tier in ("mithril", "adamant", "runic") else tier, 0.55)

    name = f"sword_{v['name']}_{tier}_s{seed}"
    return common.finish_object(name, bm)


def demo_grid():
    """All tiers x variants laid out for a style-guide screenshot."""
    objs = []
    for vi in range(3):
        for ti, tier in enumerate(common.TIERS):
            o = generate({"tier": tier, "variant": vi}, seed=1000 + ti * 10 + vi)
            o.location = (ti * 0.35, 0, vi * 1.5)
            objs.append(o)
    return objs
