"""STT ship kit - core helpers (Space Travel & Transport).

Conventions
  * Units: metres. Ship forward (nose) = -Y Blender (= +Z glTF). Up = +Z Blender (= +Y glTF).
  * A module is built in LOCAL space: front docking face at y=0, extends toward +Y (aft) to y=L.
  * Module root = Empty at the front docking face, children SOCKET_FWD / SOCKET_AFT.
  * Polar convention around the ship axis (Y): polar(a, r, y) = (r cos a, y, r sin a); a=90deg -> top (+Z).
  * UVs are written in metres (1 UV unit = 1 m) so tileable textures keep a constant texel density.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

TAU = math.tau
FWD = Vector((0.0, -1.0, 0.0))
AFT = Vector((0.0, 1.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
PFX = "STT_"

# ------------------------------------------------------------------ ship layout
SHIP_ROOT_COLL = "STT_Freighter"
COLLAR_R = 3.0        # STT-6 docking ring radius (diameter 6 m)
COLLAR_HALF = 0.75    # half collar depth on each module
MODULES = [           # key, collection, length (m)  -- front to aft
    ("CMD",   "00_Commandement", 13.0),
    ("PAX",   "01_Passagers",    21.0),
    ("CARGO", "02_Cargo",        16.0),
    ("TANK",  "03_Reservoirs",   19.0),
    ("PWR",   "04_Energie",      11.0),
    ("PROP",  "05_Propulsion",   28.0),
]
SHIP_FRONT_Y = -54.0

MODULE_VARIANTS = {   # key: (collection, length, slot it can replace or None for library parts)
    "CRG6": ("02b_Cargo_Etoile", 6.5, "CARGO"),
    "NODE6": ("06_Noeud6", 10.1, None),
    "NODE4": ("06b_Noeud4", 10.1, None),
    "ELBOW": ("06c_Coude90", 10.1, None),
    "TUNNEL": ("06d_Tunnel", 6.0, None),
    "BAY": ("07_Baie", 21.0, None),
    "SHUTTLE": ("08_Navette", 14.0, None),
}
LIBRARY_POS = {"NODE6": (-140.0, -60.0), "NODE4": (-140.0, -40.0), "ELBOW": (-140.0, -20.0),
               "TUNNEL": (-140.0, 0.0), "BAY": (-140.0, 20.0), "SHUTTLE": (-140.0, 55.0)}
VARIANT_OFFSET_X = -70.0      # variants are parked beside the ship in the .blend

def module_info(key):
    if key in MODULE_VARIANTS:
        cname, L, slot = MODULE_VARIANTS[key]
        if slot is None:
            x, y = LIBRARY_POS[key]
            return {"key": key, "coll": cname, "length": L, "y": y, "x": x, "variant_of": None}
        base = module_info(slot)
        return {"key": key, "coll": cname, "length": L, "y": base["y"], "x": VARIANT_OFFSET_X, "variant_of": slot}
    y = SHIP_FRONT_Y
    for k, c, L in MODULES:
        if k == key:
            return {"key": k, "coll": c, "length": L, "y": y}
        y += L
    raise KeyError(key)

# ------------------------------------------------------------------ math helpers
def polar(a, r, y=0.0):
    return Vector((r * math.cos(a), y, r * math.sin(a)))

def rot_y(a):
    """Rotation about the ship axis so that rot_y(a) @ (r,0,0) == polar(a, r)."""
    return Matrix.Rotation(-a, 4, "Y")

def surf_frame(a, r, y):
    """Frame on a cylinder of radius r: X = tangent, Y = +axis (aft), Z = radial outward."""
    X = Vector((math.sin(a), 0.0, -math.cos(a)))
    Y = Vector((0.0, 1.0, 0.0))
    Z = Vector((math.cos(a), 0.0, math.sin(a)))
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = X[i], Y[i], Z[i]
    m.translation = polar(a, r, y)
    return m

def look_mtx(pos, direction, up=None):
    """Matrix whose local +Y axis points along `direction` (used for nozzles, pipes...)."""
    d = Vector(direction).normalized()
    q = d.to_track_quat("Y", "Z") if abs(d.z) < 0.999 else d.to_track_quat("Y", "X")
    m = q.to_matrix().to_4x4()
    m.translation = Vector(pos)
    return m

def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))

# ------------------------------------------------------------------ collections
def coll(path):
    parent = bpy.context.scene.collection
    c = None
    for name in path.split("/"):
        c = bpy.data.collections.get(name)
        if c is None:
            c = bpy.data.collections.new(name)
        if parent.children.get(c.name) is None:
            parent.children.link(c)
        parent = c
    return c

def clear_collection(collection):
    for o in list(collection.all_objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and getattr(data, "users", 1) == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)

def purge_orphans():
    for blocks in (bpy.data.meshes, bpy.data.curves):
        for b in list(blocks):
            if b.users == 0:
                blocks.remove(b)

# ------------------------------------------------------------------ materials
# name: (base colour linear, metallic, roughness, emission colour, emission strength)
MAT_DEFS = {
    "Hull_White":       ((0.60, 0.60, 0.58), 0.05, 0.55, None, 0.0),
    "Hull_Light":       ((0.40, 0.41, 0.41), 0.10, 0.50, None, 0.0),
    "Hull_Grey":        ((0.19, 0.20, 0.21), 0.20, 0.50, None, 0.0),
    "Hull_Dark":        ((0.055, 0.06, 0.065), 0.30, 0.45, None, 0.0),
    "Metal_Bare":       ((0.56, 0.56, 0.57), 1.00, 0.35, None, 0.0),
    "Metal_Dark":       ((0.10, 0.10, 0.10), 1.00, 0.50, None, 0.0),
    "Metal_Copper":     ((0.72, 0.38, 0.22), 1.00, 0.40, None, 0.0),
    "MLI_Gold":         ((0.80, 0.55, 0.16), 1.00, 0.42, None, 0.0),
    "MLI_Silver":       ((0.80, 0.80, 0.82), 1.00, 0.22, None, 0.0),
    "Hazard_Yellow":    ((0.85, 0.55, 0.02), 0.00, 0.50, None, 0.0),
    "Hazard_Black":     ((0.015, 0.015, 0.015), 0.00, 0.60, None, 0.0),
    "Rubber":           ((0.02, 0.02, 0.02), 0.00, 0.90, None, 0.0),
    "Window":           ((0.02, 0.025, 0.03), 0.00, 0.10, (1.0, 0.72, 0.42), 4.0),
    "Bridge_Glass":     ((0.005, 0.01, 0.015), 0.00, 0.04, (0.3, 0.6, 1.0), 0.7),
    "Solar_Cell":       ((0.015, 0.025, 0.10), 0.50, 0.18, None, 0.0),
    "Solar_Frame":      ((0.55, 0.55, 0.55), 1.00, 0.40, None, 0.0),
    "Radiator":         ((0.70, 0.70, 0.67), 0.00, 0.75, None, 0.0),
    "Container_Red":    ((0.45, 0.06, 0.04), 0.30, 0.55, None, 0.0),
    "Container_Blue":   ((0.04, 0.12, 0.35), 0.30, 0.55, None, 0.0),
    "Container_Orange": ((0.75, 0.25, 0.03), 0.30, 0.55, None, 0.0),
    "Container_Green":  ((0.08, 0.22, 0.10), 0.30, 0.55, None, 0.0),
    "Container_Grey":   ((0.22, 0.23, 0.24), 0.30, 0.55, None, 0.0),
    "Container_White":  ((0.62, 0.62, 0.60), 0.20, 0.50, None, 0.0),
    "Container_Teal":   ((0.03, 0.22, 0.22), 0.30, 0.55, None, 0.0),
    "Nozzle_Inner":     ((0.09, 0.075, 0.065), 1.00, 0.38, (1.0, 0.32, 0.06), 0.12),
    "Engine_Glow":      ((0.0, 0.0, 0.0), 0.00, 1.00, (0.55, 0.78, 1.0), 40.0),
    "Engine_Plume":     ((0.0, 0.0, 0.0), 0.00, 1.00, (0.35, 0.6, 1.0), 4.0),
    "Engine_Core":      ((0.0, 0.0, 0.0), 0.00, 1.00, (0.75, 0.88, 1.0), 14.0),
    "Force_Field":      ((0.0, 0.0, 0.0), 0.00, 0.20, (0.25, 0.65, 1.0), 1.4),
    "Force_Emitter":    ((0.05, 0.1, 0.15), 0.30, 0.30, (0.3, 0.75, 1.0), 12.0),
    "Guide_Amber":      ((0.2, 0.1, 0.0), 0.00, 0.40, (1.0, 0.55, 0.05), 8.0),
    "Guide_Green":      ((0.0, 0.2, 0.05), 0.00, 0.40, (0.1, 1.0, 0.3), 8.0),
    "Nav_Red":          ((0.2, 0.0, 0.0), 0.00, 0.30, (1.0, 0.02, 0.01), 25.0),
    "Nav_Green":        ((0.0, 0.2, 0.0), 0.00, 0.30, (0.02, 1.0, 0.1), 25.0),
    "Nav_White":        ((0.3, 0.3, 0.3), 0.00, 0.30, (1.0, 1.0, 1.0), 25.0),
    "Floodlight":       ((0.3, 0.3, 0.3), 0.00, 0.20, (1.0, 0.95, 0.85), 12.0),
    "Int_Floor":        ((0.10, 0.10, 0.11), 0.10, 0.70, None, 0.0),
    "Int_Wall":         ((0.50, 0.50, 0.48), 0.00, 0.60, None, 0.0),
    "Int_Furniture":    ((0.25, 0.20, 0.16), 0.00, 0.60, None, 0.0),
    "Int_Light":        ((0.8, 0.8, 0.8), 0.00, 0.30, (1.0, 0.93, 0.8), 6.0),
    "Livery":           ((0.025, 0.13, 0.42), 0.20, 0.45, None, 0.0),
    "Livery_Dark":      ((0.012, 0.05, 0.16), 0.20, 0.45, None, 0.0),
    "Human_Ref":        ((0.9, 0.3, 0.05), 0.00, 0.60, None, 0.0),
}

ALPHA = {"Engine_Plume": 0.22, "Engine_Core": 0.75, "Force_Field": 0.14}

def mat(name):
    full = PFX + name
    m = bpy.data.materials.get(full)
    if m is not None:
        return m
    base, metal, rough, emc, ems = MAT_DEFS[name]
    m = bpy.data.materials.new(full)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        nt.nodes.clear()
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        out.location = (300, 0)
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emc:
        bsdf.inputs["Emission Color"].default_value = (*emc, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ems
    if name in ALPHA:
        bsdf.inputs["Alpha"].default_value = ALPHA[name]
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try: setattr(m, attr, val)
            except Exception: pass
        try: m.use_backface_culling = False
        except Exception: pass
    vc = emc if emc else base
    m.diffuse_color = (vc[0], vc[1], vc[2], 1.0)
    m.metallic = metal
    m.roughness = rough
    if name not in ALPHA:
        m.use_backface_culling = True  # single-sided (glTF doubleSided=false)
    return m

def build_all_materials():
    return [mat(n) for n in MAT_DEFS]

# ------------------------------------------------------------------ geometry utils
def _dedupe(verts):
    out = []
    for v in verts:
        if not out or out[-1] is not v:
            out.append(v)
    if len(out) > 1 and out[0] is out[-1]:
        out.pop()
    return out

def fillet(pts, rad, steps=4):
    pts = [Vector(p) for p in pts]
    if rad <= 0 or len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        d1, d2 = p1 - p0, p2 - p1
        d = min(rad, d1.length * 0.45, d2.length * 0.45)
        a = p1 - d1.normalized() * d
        b = p1 + d2.normalized() * d
        for s in range(steps + 1):
            t = s / steps
            out.append((1 - t) ** 2 * a + 2 * (1 - t) * t * p1 + t * t * b)
    out.append(pts[-1])
    return out


class MB:
    """Mesh builder: accumulates geometry (per-face materials, metre-scale UVs) into one bmesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []

    # -- low level
    def mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def v(self, co):
        return self.bm.verts.new(co)

    def face(self, verts, m, uvs=None):
        verts = _dedupe(verts)
        if len(verts) < 3 or len(set(verts)) != len(verts):
            return None
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.mi(m)
        f.normal_update()
        if uvs:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        else:
            self._boxuv(f)
        return f

    def _boxuv(self, f):
        n = f.normal if f.normal.length > 0 else Vector((0, 0, 1))
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 0:
                loop[self.uv].uv = (co.y, co.z)
            elif ax == 1:
                loop[self.uv].uv = (co.x, co.z)
            else:
                loop[self.uv].uv = (co.x, co.y)

    # -- primitives
    def revolve(self, profile, seg=24, mats="Hull_White", mtx=None, a0=None, flip=False,
                cap0=False, cap1=False, cap_mat=None, arc=None):
        """Surface of revolution around local Y.
        profile: [(r, y), ...]. Walking along the profile, the surface faces to the RIGHT
        (i.e. outward when going aft at constant r). Trace solids front-axis -> outside -> aft-axis.
        mats: str | list (one per band) | callable(band, j) -> str.
        arc: None for full revolve, or (a_start, a_end) for an open partial revolve."""
        M = mtx if mtx is not None else Matrix.Identity(4)
        full = arc is None
        if a0 is None:
            a0 = math.pi / seg
        ncol = seg if full else seg + 1
        angles = [(a0 + TAU * j / seg) if full else (arc[0] + (arc[1] - arc[0]) * j / seg)
                  for j in range(seg + 1)]
        # cumulative profile length for V
        s = [0.0]
        for i in range(1, len(profile)):
            dr = profile[i][0] - profile[i - 1][0]
            dy = profile[i][1] - profile[i - 1][1]
            s.append(s[-1] + math.hypot(dr, dy))
        rings = []
        for (r, y) in profile:
            if r < 1e-6:
                pole = self.v(M @ Vector((0.0, y, 0.0)))
                rings.append([pole] * ncol)
            else:
                rings.append([self.v(M @ polar(angles[j], r, y)) for j in range(ncol)])
        for i in range(len(profile) - 1):
            for j in range(seg):
                jn = (j + 1) % seg if full else j + 1
                ua, ub = angles[j] - a0 if full else angles[j], angles[j + 1] - a0 if full else angles[j + 1]
                r0, r1 = max(profile[i][0], 1e-3), max(profile[i + 1][0], 1e-3)
                quad = [rings[i][j], rings[i + 1][j], rings[i + 1][jn], rings[i][jn]]
                uvs = [(ua * r0, s[i]), (ua * r1, s[i + 1]), (ub * r1, s[i + 1]), (ub * r0, s[i])]
                if flip:
                    quad.reverse(); uvs.reverse()
                if callable(mats):
                    m = mats(i, j)
                elif isinstance(mats, (list, tuple)):
                    m = mats[min(i, len(mats) - 1)]
                else:
                    m = mats
                if profile[i][0] < 1e-6 or profile[i + 1][0] < 1e-6:
                    self.face(quad, m)  # triangle at pole: box uv
                else:
                    self.face(quad, m, uvs)
        cm = cap_mat or (mats if isinstance(mats, str) else "Hull_Grey")
        if cap0 and profile[0][0] > 1e-6:
            ring = rings[0][:seg]
            self.face(list(reversed(ring)) if flip else ring, cm)
        if cap1 and profile[-1][0] > 1e-6:
            ring = rings[-1][:seg]
            self.face(ring if flip else list(reversed(ring)), cm)
        return rings

    def cyl(self, r, length, seg=12, m="Metal_Bare", mtx=None, caps=True, a0=None):
        """Closed cylinder along local +Y from y=0 to y=length."""
        prof = [(0.0, 0.0), (r, 0.0), (r, length), (0.0, length)] if caps else [(r, 0.0), (r, length)]
        return self.revolve(prof, seg, m, mtx, a0=a0)

    def box(self, size, loc=(0, 0, 0), m="Hull_Grey", mtx=None, rot=None, taper=1.0):
        """Axis-aligned box (optionally tapered on +Z face) transformed by mtx @ T(loc) @ rot."""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        tx, ty = sx * taper, sy * taper
        c = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
             (-tx, -ty, sz), (tx, -ty, sz), (tx, ty, sz), (-tx, ty, sz)]
        M = (mtx if mtx is not None else Matrix.Identity(4)) @ Matrix.Translation(loc)
        if rot is not None:
            M = M @ rot
        v = [self.v(M @ Vector(p)) for p in c]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([v[i] for i in f], m)
        return v

    def extrude(self, poly, h, m="Hull_Grey", mtx=None, side_mat=None):
        """Extrude a 2D polygon (local XY, CCW seen from +Z) along +Z by h."""
        M = mtx if mtx is not None else Matrix.Identity(4)
        b = [self.v(M @ Vector((x, y, 0.0))) for x, y in poly]
        t = [self.v(M @ Vector((x, y, h))) for x, y in poly]
        self.face(list(reversed(b)), m)
        self.face(t, m)
        n = len(poly)
        for i in range(n):
            k = (i + 1) % n
            self.face([b[i], b[k], t[k], t[i]], side_mat or m)

    def pipe(self, pts, r, sides=8, m="Metal_Bare", fillet_r=0.0, caps=True, steps=4):
        pts = fillet(pts, fillet_r, steps) if fillet_r > 0 else [Vector(p) for p in pts]
        n = len(pts)
        if n < 2:
            return
        rings, side, vacc = [], None, [0.0]
        for i in range(1, n):
            vacc.append(vacc[-1] + (pts[i] - pts[i - 1]).length)
        for i, p in enumerate(pts):
            if i == 0:
                t = (pts[1] - p).normalized()
            elif i == n - 1:
                t = (p - pts[i - 1]).normalized()
            else:
                t = ((p - pts[i - 1]).normalized() + (pts[i + 1] - p).normalized()).normalized()
            if side is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                side = t.cross(ref).normalized()
            else:
                side = (side - t * side.dot(t)).normalized()
            up = t.cross(side)
            rings.append([self.v(p + (side * math.cos(TAU * k / sides) + up * math.sin(TAU * k / sides)) * r)
                          for k in range(sides)])
        circ = TAU * r
        for i in range(n - 1):
            for k in range(sides):
                kn = (k + 1) % sides
                u0, u1 = circ * k / sides, circ * (k + 1) / sides
                self.face([rings[i][k], rings[i][kn], rings[i + 1][kn], rings[i + 1][k]], m,
                          [(u0, vacc[i]), (u1, vacc[i]), (u1, vacc[i + 1]), (u0, vacc[i + 1])])
        if caps:
            self.face(list(reversed(rings[0])), m)
            self.face(rings[-1], m)

    def strut(self, p0, p1, r=0.06, sides=6, m="Metal_Dark"):
        self.pipe([p0, p1], r, sides, m, caps=False)

    # -- output
    def to_object(self, name, collection, parent=None, loc=(0, 0, 0), smooth_angle=35.0,
                  bevel=0.0, bevel_segments=1, weighted=True):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for mn in self.mats:
            me.materials.append(mat(mn))
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        ob.location = loc
        finish(ob, smooth_angle, bevel, bevel_segments, weighted)
        return ob


# ------------------------------------------------------------------ rectangular sections
def rect_loop(w, h, rc, cseg=1):
    """Rounded (cseg>=2) or chamfered (cseg=1) rectangle in the (x, z) plane, ordered by increasing
    polar angle starting on the +X side (same ordering as revolve rings). Returns [(x, z), ...]."""
    rc = max(1e-3, min(rc, w / 2 - 1e-3, h / 2 - 1e-3))
    cx, cz = w / 2 - rc, h / 2 - rc
    pts = []
    for q, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        for k in range(cseg + 1):
            a = (q + k / cseg) * math.pi / 2
            pts.append((sx * cx + rc * math.cos(a), sz * cz + rc * math.sin(a)))
    return pts

def rect_side_segments(cseg):
    """Loop segment indices of the 4 flat sides: [top, left, bottom, right]."""
    return [q * (cseg + 1) + cseg for q in range(4)]

def rect_sweep(mb, w, h, rc, cseg, profile, mats="Hull_White", mtx=None, cap0=False, cap1=False, cap_mat=None):
    """Like MB.revolve but with a (chamfered/rounded) rectangular section.
    profile: [(inset d, y), ...]; the section at each step is rect_loop(w-2d, h-2d, rc-d).
    Same facing rule as revolve (walking the profile, the surface faces right).
    mats: str | list per band | callable(band, seg_index) -> str."""
    M = mtx if mtx is not None else Matrix.Identity(4)
    n = 4 * (cseg + 1)
    s = [0.0]
    for i in range(1, len(profile)):
        s.append(s[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
    rings, perims = [], []
    for d, y in profile:
        lp = rect_loop(max(0.02, w - 2 * d), max(0.02, h - 2 * d), max(0.01, rc - d), cseg)
        rings.append([mb.v(M @ Vector((x, y, z))) for x, z in lp])
        acc = [0.0]
        for j in range(1, n + 1):
            a, b = lp[j - 1], lp[j % n]
            acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        perims.append(acc)
    for i in range(len(profile) - 1):
        for j in range(n):
            jn = (j + 1) % n
            quad = [rings[i][j], rings[i + 1][j], rings[i + 1][jn], rings[i][jn]]
            uvs = [(perims[i][j], s[i]), (perims[i + 1][j], s[i + 1]), (perims[i + 1][j + 1], s[i + 1]), (perims[i][j + 1], s[i])]
            if callable(mats):
                m = mats(i, j)
            elif isinstance(mats, (list, tuple)):
                m = mats[min(i, len(mats) - 1)]
            else:
                m = mats
            mb.face(quad, m, uvs)
    cm = cap_mat or (mats if isinstance(mats, str) else "Hull_Grey")
    if cap0:
        mb.face(rings[0], cm)
    if cap1:
        mb.face(list(reversed(rings[-1])), cm)
    return rings

def rect_to_round_plate(mb, w, h, rc, cseg, r_in, y, facing=-1, mat="Hull_Grey", mtx=None, inner_pts=None):
    """Flat plate at y between the rectangular outline and a round opening of radius r_in."""
    M = mtx if mtx is not None else Matrix.Identity(4)
    lp = rect_loop(w, h, rc, cseg)
    n = len(lp)
    outer = [mb.v(M @ Vector((x, y, z))) for x, z in lp]
    inner = [mb.v(M @ Vector((r_in * math.cos(math.atan2(z, x)), y, r_in * math.sin(math.atan2(z, x))))) for x, z in lp]
    for j in range(n):
        jn = (j + 1) % n
        q = [inner[j], outer[j], outer[jn], inner[jn]]   # walking outward at const y -> faces -Y
        mb.face(q if facing < 0 else list(reversed(q)), mat)

def loft(mb, sections, mats="Hull_White", mtx=None):
    """Loft between 2D loops [(loop2d, y), ...] (equal vertex counts, rect_loop ordering).
    Same facing rule as revolve. mats: str | list per band | callable(band, seg)."""
    M = mtx if mtx is not None else Matrix.Identity(4)
    n = len(sections[0][0])
    rings = [[mb.v(M @ Vector((x, y, z))) for x, z in lp] for lp, y in sections]
    for i in range(len(sections) - 1):
        for j in range(n):
            jn = (j + 1) % n
            m = mats(i, j) if callable(mats) else (mats[min(i, len(mats) - 1)] if isinstance(mats, (list, tuple)) else mats)
            mb.face([rings[i][j], rings[i + 1][j], rings[i + 1][jn], rings[i][jn]], m)
    return rings

def loop_to_round_plate(mb, loop, r_in, y, facing=-1, mat="Hull_Grey", mtx=None):
    M = mtx if mtx is not None else Matrix.Identity(4)
    n = len(loop)
    outer = [mb.v(M @ Vector((x, y, z))) for x, z in loop]
    inner = [mb.v(M @ Vector((r_in * math.cos(math.atan2(z, x)), y, r_in * math.sin(math.atan2(z, x))))) for x, z in loop]
    for j in range(n):
        jn = (j + 1) % n
        q = [inner[j], outer[j], outer[jn], inner[jn]]
        mb.face(q if facing < 0 else list(reversed(q)), mat)

def loop_to_loop_plate(mb, outer_loop, inner_loop, y, facing=-1, mat="Hull_Grey", mtx=None):
    """Flat ring plate between two loops of equal vertex count at y."""
    M = mtx if mtx is not None else Matrix.Identity(4)
    n = len(outer_loop)
    o = [mb.v(M @ Vector((x, y, z))) for x, z in outer_loop]
    i_ = [mb.v(M @ Vector((x, y, z))) for x, z in inner_loop]
    for j in range(n):
        jn = (j + 1) % n
        q = [i_[j], o[j], o[jn], i_[jn]]
        mb.face(q if facing < 0 else list(reversed(q)), mat)


def side_frame(side, w, h, y, u=0.0, lift=0.0):
    """Frame on a flat side of a w x h rectangular hull. side: 'top','bottom','left','right'.
    Z = outward normal, Y = +axis (aft), X = Y x Z.  u = offset along X on that side."""
    Zs = {"top": (0, 0, 1), "bottom": (0, 0, -1), "left": (-1, 0, 0), "right": (1, 0, 0)}
    Z = Vector(Zs[side]); Y = Vector((0, 1, 0)); X = Y.cross(Z)
    half = h / 2 if side in ("top", "bottom") else w / 2
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = X[i], Y[i], Z[i]
    m.translation = Z * (half + lift) + X * u + Y * y
    return m

def side_width(side, w, h, rc):
    return (w if side in ("top", "bottom") else h) - 2 * rc

def corner_frame(q, w, h, rc, cseg, y, lift=0.0):
    """Frame on corner q (0:+x+z, 1:-x+z, 2:-x-z, 3:+x-z) at 45 deg. Z = outward normal."""
    sx, sz = ((1, 1), (-1, 1), (-1, -1), (1, -1))[q]
    a = (q + 0.5) * math.pi / 2
    n = Vector((math.cos(a), 0, math.sin(a)))
    dist = rc * (math.cos(math.pi / 4) if cseg == 1 else math.cos(math.pi / (4 * cseg)) if cseg % 2 else 1.0)
    c = Vector((sx * (w / 2 - rc), 0, sz * (h / 2 - rc)))
    Y = Vector((0, 1, 0)); X = Y.cross(n)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = X[i], Y[i], n[i]
    m.translation = c + n * (dist + lift) + Y * y
    return m


def finish(ob, smooth_angle=35.0, bevel=0.0, segs=1, weighted=True):
    me = ob.data
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    try:
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    except Exception:
        pass
    if bevel > 0:
        b = ob.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(smooth_angle)
        b.harden_normals = True
        b.use_clamp_overlap = True
    if weighted:
        w = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        w.keep_sharp = True


# ------------------------------------------------------------------ empties & roots
def empty(name, collection, parent=None, loc=(0, 0, 0), direction=None, kind="PLAIN_AXES",
          size=0.5, props=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    e.location = loc
    if direction is not None:
        d = Vector(direction).normalized()
        e.rotation_mode = "QUATERNION"
        e.rotation_quaternion = d.to_track_quat("Z", "Y") if abs(d.y) < 0.999 else d.to_track_quat("Z", "X")
    if props:
        for k, v in props.items():
            e[k] = v
    return e


def socket_quat(direction):
    """Standard socket frame. Mating rule: child_socket_world = parent_socket_world @ Rx(180) @ Rz(roll)."""
    Z = Vector(direction).normalized()
    X = Vector((0, 0, 1)) if abs(Z.z) < 0.9 else Vector((0, 1, 0))
    X = (X - Z * X.dot(Z)).normalized()
    Y = Z.cross(X)
    m = Matrix.Identity(3)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = X[i], Y[i], Z[i]
    return m.to_quaternion()

def socket(name, collection, parent, loc, direction, port, size=2.0):
    e = empty(name, collection, parent, loc, None, "SINGLE_ARROW", size, {"stt_socket": port})
    e.rotation_mode = "QUATERNION"
    e.rotation_quaternion = socket_quat(direction)
    return e

def reorient_sockets():
    """Bring every docking socket to the standard frame (keeps its outward direction)."""
    n = 0
    for o in bpy.data.objects:
        if o.name.startswith("SOCKET_") and o.get("stt_socket") not in (None, "container"):
            d = o.matrix_local.to_3x3() @ Vector((0, 0, 1))
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = socket_quat(d)
            n += 1
    return n

def module_root(key, props=None):
    """Create (or reset) a module collection + root empty + docking sockets. Returns (root, collection, info)."""
    info = module_info(key)
    c = coll(SHIP_ROOT_COLL + "/" + info["coll"])
    clear_collection(c)
    root = empty(f"STT_{key}_ROOT", c, kind="CUBE", size=1.0)
    root.location = (info.get("x", 0.0), info["y"], 0.0)
    if info.get("variant_of"):
        root["stt_variant_of"] = info["variant_of"].lower()
    root["stt_module"] = key.lower()
    root["stt_length_m"] = info["length"]
    root["stt_collar_diameter_m"] = COLLAR_R * 2
    for k, v in (props or {}).items():
        root[k] = v
    socket("SOCKET_FWD", c, root, (0, 0, 0), FWD, "fwd")
    socket("SOCKET_AFT", c, root, (0, info["length"], 0), AFT, "aft")
    for o in c.objects:
        if o.name.startswith("SOCKET_"):
            o.name = f"SOCKET_{key}_{o['stt_socket'].upper()}"
    return root, c, info


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs:
        if o.type != "MESH":
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        oe.to_mesh_clear()
    return total


def collection_tris(collection):
    return tri_count(list(collection.all_objects))
