"""Anatomical sculpt refinement for body parts.

Runs the sculpt toolkit over each assembled, skinned part to add muscle
masses — pecs, abs, spinal furrow, deltoids, biceps, forearm flexors,
quads, calves, knee caps. Deterministic; keeps bone weights (sculpt only
moves existing verts). Called per part after it's committed.
"""
try:
    import sculpt as _sc
except ImportError:
    from rig import sculpt as _sc  # pragma: no cover


def _run(obj, ops):
    S = _sc.Sculpt.from_object(obj, mirror_x=True)
    for brush, kw in ops:
        getattr(S, brush)(**kw)
    S.despike(threshold=1.1, keep=0.25)
    S.commit(shade_smooth=True)
    S.free()
    return obj


def torso(obj, p, k, sex):
    """pecs, abs, spinal furrow, trapezius, clavicles."""
    tw = p["torso_w"]
    cz = k["chest0"]
    m = sex == "m"
    ops = [
        # pectorals / bust
        ("inflate", dict(center=(0.07, -0.11 * tw, cz + 0.02), radius=0.11, amount=0.022 if m else 0.03)),
        # abdominal wall
        ("inflate", dict(center=(0.04, -0.10 * tw, k["spine0"] + 0.03), radius=0.10, amount=0.016 if m else 0.008)),
        ("crease", dict(center=(0, -0.11 * tw, k["spine0"] + 0.05), radius=0.05, depth=0.01)),  # linea alba
        # trapezius ramp into the neck
        ("inflate", dict(center=(0.08, 0.02, k["neck0"] - 0.02), radius=0.09, amount=0.02 if m else 0.012)),
        # spinal furrow (back)
        ("crease", dict(center=(0, 0.11 * tw, cz - 0.02), radius=0.09, depth=0.014)),
        # shoulder blades
        ("inflate", dict(center=(0.12, 0.09 * tw, cz + 0.04), radius=0.08, amount=0.012)),
        # clavicle ridge
        ("inflate", dict(center=(0.1, -0.09 * tw, cz + 0.13), radius=0.06, amount=0.01)),
        # waist taper
        ("pinch", dict(center=(0.17, 0, k["spine0"] + 0.02), radius=0.1, amount=0.08 if m else 0.14)),
    ]
    return _run(obj, ops)


def arms(obj, p, k):
    """deltoid cap, biceps belly, triceps, forearm flexor, elbow."""
    w = p["limb_w"]
    ax = k["arm_x"]
    up_mid = (k["arm_top"] + k["elbow"]) / 2
    fo_mid = (k["elbow"] + k["wrist"]) / 2
    ops = [
        ("inflate", dict(center=(ax, -0.02, k["arm_top"] + 0.02), radius=0.07 * w, amount=0.018 * w)),  # deltoid
        ("inflate", dict(center=(ax, -0.03, up_mid), radius=0.055 * w, amount=0.016 * w)),               # biceps
        ("inflate", dict(center=(ax, 0.03, up_mid - 0.02), radius=0.05 * w, amount=0.011 * w)),          # triceps
        ("pinch", dict(center=(ax, 0, k["elbow"]), radius=0.045 * w, amount=0.08)),                      # elbow
        ("inflate", dict(center=(ax, -0.015, fo_mid), radius=0.045 * w, amount=0.013 * w)),              # forearm flexor
    ]
    return _run(obj, ops)


def legs(obj, p, k):
    """quad sweep, inner thigh, knee cap, calf gastro."""
    w = p["limb_w"]
    tx = k["thigh_x"]
    th_mid = (k["hip_h"] + k["knee"]) / 2
    sh_mid = (k["knee"] + k["ankle"]) / 2
    ops = [
        ("inflate", dict(center=(tx, -0.03, th_mid), radius=0.07 * w, amount=0.02 * w)),      # quadriceps
        ("inflate", dict(center=(tx - 0.02, 0, th_mid), radius=0.055 * w, amount=0.012 * w)), # inner thigh
        ("inflate", dict(center=(tx, -0.02, k["knee"] + 0.02), radius=0.045 * w, amount=0.012 * w)),  # knee cap
        ("pinch", dict(center=(tx, 0, k["knee"]), radius=0.04 * w, amount=0.06)),             # behind knee
        ("inflate", dict(center=(tx, 0.03, sh_mid + 0.03), radius=0.05 * w, amount=0.017 * w)),  # calf
        ("pinch", dict(center=(tx, 0, k["ankle"] + 0.04), radius=0.04 * w, amount=0.1)),      # ankle
    ]
    return _run(obj, ops)
