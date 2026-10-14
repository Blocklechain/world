"""Code-driven sculpting toolkit.

Digital sculpting is falloff-weighted vertex displacement; this module gives
the standard brush set as deterministic functions over a bmesh, with X-mirror
symmetry like real sculpt tools. Workflow mirrors hand sculpting: block in
with grab/inflate, refine with pinch/crease, relax with smooth — checking a
viewport screenshot between passes.

Usage:
    s = Sculpt.from_object(obj, mirror_x=True)
    s.grab(center=(0, -0.1, 1.6), radius=0.4, offset=(0, -0.1, 0))
    s.inflate(...)
    s.commit()

(Blender 5.3 note: driving the native Sculpt Mode via bpy.ops.sculpt.
brush_stroke currently no-ops without an activated brush *asset*; this
toolkit is our primary path and is pipeline-deterministic anyway.)
"""
import math

import bmesh
import bpy
from mathutils import Vector


def _smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


FALLOFFS = {
    "smooth": lambda t: _smoothstep(1 - t),
    "sharp": lambda t: (1 - t) ** 2,
    "dome": lambda t: math.sqrt(max(0.0, 1 - t * t)),
    "linear": lambda t: 1 - t,
}


class Sculpt:
    def __init__(self, obj: bpy.types.Object, mirror_x: bool = True):
        self.obj = obj
        self.mirror_x = mirror_x
        self.bm = bmesh.new()
        self.bm.from_mesh(obj.data)
        self.bm.verts.ensure_lookup_table()
        self.bm.normal_update()

    @classmethod
    def from_object(cls, obj, mirror_x=True):
        return cls(obj, mirror_x)

    # ---- core ---------------------------------------------------------------

    def _affected(self, center: Vector, radius: float):
        """[(vert, weight)] within radius."""
        out = []
        for v in self.bm.verts:
            d = (v.co - center).length
            if d < radius:
                out.append((v, d / radius))
        return out

    def _apply(self, center, radius, fn, falloff="smooth"):
        """fn(vert, weight) for both the brush and its X-mirror."""
        centers = [Vector(center)]
        if self.mirror_x and abs(center[0]) > 1e-6:
            centers.append(Vector((-center[0], center[1], center[2])))
        fo = FALLOFFS[falloff]
        for i, c in enumerate(centers):
            mirrored = i == 1
            for v, t in self._affected(c, radius):
                fn(v, fo(t), mirrored)
        self.bm.normal_update()

    # ---- brushes ------------------------------------------------------------

    def grab(self, center, radius, offset, falloff="smooth"):
        off = Vector(offset)

        def fn(v, w, mirrored):
            o = Vector((-off.x, off.y, off.z)) if mirrored else off
            v.co += o * w

        self._apply(center, radius, fn, falloff)

    def inflate(self, center, radius, amount, falloff="smooth"):
        def fn(v, w, _m):
            v.co += v.normal * (amount * w)

        self._apply(center, radius, fn, falloff)

    def pinch(self, center, radius, amount, falloff="smooth"):
        def fn(v, w, m):
            c = Vector(center)
            if m:
                c = Vector((-c.x, c.y, c.z))
            v.co += (c - v.co) * (amount * w)

        self._apply(center, radius, fn, falloff)

    def flatten(self, center, radius, amount=0.5, falloff="smooth"):
        verts = self._affected(Vector(center), radius)
        if not verts:
            return
        n = Vector((0, 0, 0))
        p0 = Vector((0, 0, 0))
        for v, _ in verts:
            n += v.normal
            p0 += v.co
        n.normalize()
        p0 /= len(verts)

        def fn(v, w, _m):
            dist = (v.co - p0).dot(n)
            v.co -= n * (dist * amount * w)

        self._apply(center, radius, fn, falloff)

    def crease(self, center, radius, depth, falloff="sharp"):
        """Carve a groove: push along -normal with a sharp falloff + pinch."""

        def fn(v, w, m):
            c = Vector(center)
            if m:
                c = Vector((-c.x, c.y, c.z))
            v.co -= v.normal * (depth * w)
            v.co += (c - v.co) * (0.25 * depth * w / max(radius, 1e-5))

        self._apply(center, radius, fn, falloff)

    def smooth(self, center, radius, iterations=2, lam=0.5, falloff="smooth"):
        for _ in range(iterations):
            verts = self._affected(Vector(center), radius)
            if self.mirror_x and abs(center[0]) > 1e-6:
                verts += self._affected(Vector((-center[0], center[1], center[2])), radius)
            fo = FALLOFFS[falloff]
            moves = []
            for v, t in verts:
                nbrs = [e.other_vert(v).co for e in v.link_edges]
                if not nbrs:
                    continue
                avg = sum(nbrs, Vector()) / len(nbrs)
                moves.append((v, (avg - v.co) * (lam * fo(t))))
            for v, mv in moves:
                v.co += mv
        self.bm.normal_update()

    def stroke(self, points, radius, brush="inflate", **kw):
        """Run a brush along a polyline of 3D points, like dragging a stylus."""
        for p in points:
            getattr(self, brush)(center=p, radius=radius, **kw)

    # ---- topology -----------------------------------------------------------

    def subdivide_region(self, center, radius, cuts=1):
        """Local dyntopo-ish detail: subdivide edges fully inside the sphere."""
        c = Vector(center)
        edges = [
            e for e in self.bm.edges
            if (e.verts[0].co - c).length < radius and (e.verts[1].co - c).length < radius
        ]
        if edges:
            bmesh.ops.subdivide_edges(self.bm, edges=edges, cuts=cuts, use_grid_fill=True)
        self.bm.verts.ensure_lookup_table()
        self.bm.normal_update()

    def despike(self, threshold=0.9, keep=0.15):
        """Snap vertices that sit far off their neighbour average (spike repair)."""
        from mathutils import Vector
        fixed = 0
        for v in self.bm.verts:
            nbrs = [e.other_vert(v).co for e in v.link_edges]
            if not nbrs:
                continue
            avg = sum(nbrs, Vector()) / len(nbrs)
            mean_edge = sum((n - v.co).length for n in nbrs) / len(nbrs)
            if (v.co - avg).length > mean_edge * threshold:
                v.co = avg + (v.co - avg) * keep
                fixed += 1
        self.bm.normal_update()
        return fixed

    def symmetrize(self, direction="X"):
        """Copy one side over the other — the clean fix for asymmetric blobs
        on things meant to be mirrored."""
        bmesh.ops.symmetrize(
            self.bm,
            input=list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces),
            direction=direction,
            dist=0.0005,
        )
        self.bm.verts.ensure_lookup_table()
        self.bm.normal_update()

    # ---- io -----------------------------------------------------------------

    def commit(self, shade_smooth=True):
        for f in self.bm.faces:
            f.smooth = shade_smooth
        self.bm.to_mesh(self.obj.data)
        self.obj.data.update()

    def free(self):
        self.bm.free()
