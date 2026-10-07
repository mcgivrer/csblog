"""STT ship kit - shared parts (docking collar, truss, RCS, tanks, lights, greebles...).
All functions append geometry to a stt_core.MB builder, in module-local coordinates.
"""
import math, random
from mathutils import Vector, Matrix
from . import stt_core as C
from .stt_core import TAU, polar, surf_frame, look_mtx, T

# ------------------------------------------------------------------ STT-6 docking collar
COLLAR_PROFILE = [  # (r, d) d = depth from the joint face into the module
    (0.0, 0.10), (1.6, 0.10), (1.6, 0.03), (2.2, 0.03), (2.2, 0.0), (2.6, 0.0), (2.6, 0.03),
    (3.0, 0.03), (3.05, 0.08), (3.05, 0.55), (2.85, 0.66), (2.85, C.COLLAR_HALF),
]

def _collar_mats(i, j):
    return {0: "Hull_Grey", 1: "Metal_Dark", 2: "Metal_Bare", 3: "Rubber", 4: "Rubber", 5: "Rubber",
            6: "Hull_Light", 7: "Hull_Light",
            8: ("Hazard_Yellow" if (j // 2) % 2 == 0 else "Hazard_Black")}.get(i, "Hull_Grey")

def port_matrix(center, direction, dist):
    """Joint-space matrix for a collar whose joint face is at center + direction * dist (local +Y = inward)."""
    d = Vector(direction).normalized()
    Y = -d
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))
    X = up.cross(Y).normalized(); Z = X.cross(Y)
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2] = X[i], Y[i], Z[i]
    M.translation = Vector(center) + d * dist
    return M

def collar(mb, side="fwd", length=0.0, seg=24, M=None):
    """Half docking collar. side='fwd': joint face at y=0. side='aft': joint face at y=length.
    M: explicit joint-space matrix (see port_matrix). Returns the transform used."""
    if M is None:
        M = Matrix.Identity(4) if side == "fwd" else T(0, length, 0) @ Matrix.Rotation(math.pi, 4, "Z")
    mb.revolve(COLLAR_PROFILE, seg, _collar_mats, M)
    # latches on the outer ring
    for k in range(6):
        a = TAU * k / 6 + TAU / 12
        F = M @ surf_frame(a, 3.05, 0.30)
        mb.box((0.38, 0.42, 0.16), (0, 0, 0.08), "Metal_Dark", F, taper=0.8)
    # umbilical connectors on the rim face
    for a in (0.0, math.pi):
        p = M @ polar(a, 1.9, 0.03)
        d = (M.to_3x3() @ Vector((0, -1, 0)))
        mb.revolve([(0.0, -0.06), (0.16, -0.06), (0.16, 0.0)], 10, "Metal_Bare", look_mtx(p, d) @ Matrix.Rotation(math.pi, 4, "X"))
    return M

# ------------------------------------------------------------------ hull helpers
def hull_tube(mb, r, y0, y1, seg=16, mat="Hull_Grey", grooves=(), groove_mat="Metal_Dark", depth=0.04):
    """Open faceted tube along Y with recessed panel grooves at given y positions."""
    prof = [(r, y0)]
    mats = []
    for g in sorted(grooves):
        prof += [(r, g - 0.06), (r - depth, g - 0.03), (r - depth, g + 0.03), (r, g + 0.06)]
        mats += [mat, groove_mat, groove_mat, groove_mat]
    prof.append((r, y1))
    mats.append(mat)
    mb.revolve(prof, seg, mats)

def apothem(r, seg):
    return r * math.cos(math.pi / seg)

def facet_width(r, seg):
    return 2 * r * math.sin(math.pi / seg)

def facet_angle(k, seg):
    return TAU * (k + 1) / seg

def hull_plates(mb, r, seg, y0, y1, rows, gap=0.10, t=0.07, mats=("Hull_White", "Hull_Light"),
                skip_prob=0.12, skip_facets=(), seed=1):
    """Armour-like plates on each facet of a faceted hull (radius r = vertex radius)."""
    rnd = random.Random(seed)
    ap, fw = apothem(r, seg), facet_width(r, seg)
    rl = (y1 - y0) / rows
    for k in range(seg):
        if k in skip_facets:
            continue
        a = facet_angle(k, seg)
        for i in range(rows):
            if rnd.random() < skip_prob:
                continue
            yc = y0 + rl * (i + 0.5)
            tt = t * rnd.uniform(0.7, 1.3)
            m = mats[0] if rnd.random() < 0.72 else mats[1 % len(mats)]
            mb.box((fw - gap, rl - gap, tt), (0, 0, tt / 2), m, surf_frame(a, ap, yc), taper=0.985)

def greebles(mb, r, seg, y0, y1, count, seed=7, base=0.07, facets=None,
             mats=("Hull_Grey", "Hull_Dark", "Metal_Dark", "Hull_Light")):
    rnd = random.Random(seed)
    ap, fw = apothem(r, seg), facet_width(r, seg)
    facets = list(facets) if facets is not None else list(range(seg))
    for _ in range(count):
        k = rnd.choice(facets)
        a = facet_angle(k, seg)
        sx = rnd.uniform(0.25, min(1.4, fw * 0.6))
        sy = rnd.uniform(0.3, 2.2)
        sz = rnd.uniform(0.06, 0.32)
        off = rnd.uniform(-(fw - sx) / 2, (fw - sx) / 2) * 0.9
        yc = rnd.uniform(y0 + sy / 2, y1 - sy / 2)
        F = surf_frame(a, ap + base, yc) @ T(off, 0, 0)
        mb.box((sx, sy, sz), (0, 0, sz / 2), rnd.choice(mats), F, taper=rnd.choice((1.0, 0.85, 0.7)))

def hazard_ring(mb, r, y0, y1, seg=24, blocks=8, mtx=None):
    per = max(1, seg // (blocks * 2))
    mb.revolve([(r, y0), (r, y1)], seg,
               lambda i, j: "Hazard_Yellow" if (j // per) % 2 == 0 else "Hazard_Black", mtx)

def bulkhead(mb, r_out, r_in, y, facing=-1, seg=16, mat="Hull_Grey", a0=None):
    """Flat annular end plate at y (facing -Y if facing<0 else +Y)."""
    if facing < 0:
        mb.revolve([(r_in, y), (r_out, y)], seg, mat, a0=a0)
    else:
        mb.revolve([(r_out, y), (r_in, y)], seg, mat, a0=a0)

# ------------------------------------------------------------------ structure
def truss(mb, p0, p1, w=1.2, bays=4, r_long=0.07, r_diag=0.04, m="Metal_Dark", up=None):
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0)
    L = ax.length
    ax.normalize()
    ref = Vector(up) if up is not None else (Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0)))
    s = ax.cross(ref).normalized()
    u = s.cross(ax).normalized()
    h = w / 2
    corners = [s * h + u * h, -s * h + u * h, -s * h - u * h, s * h - u * h]
    for c in corners:
        mb.pipe([p0 + c, p1 + c], r_long, 6, m, caps=True)
    for b in range(bays + 1):
        q = p0 + ax * (L * b / bays)
        for k in range(4):
            mb.pipe([q + corners[k], q + corners[(k + 1) % 4]], r_diag, 4, m, caps=False)
        if b < bays:
            qn = p0 + ax * (L * (b + 1) / bays)
            for k in range(4):
                ka, kb = (k, (k + 1) % 4) if b % 2 == 0 else ((k + 1) % 4, k)
                mb.pipe([q + corners[ka], qn + corners[kb]], r_diag, 4, m, caps=False)

def handrail(mb, pts, normal, standoff=0.14, r=0.022, m="Hazard_Yellow", every=1.2):
    n = Vector(normal).normalized()
    pts = [Vector(p) for p in pts]
    mb.pipe([p + n * standoff for p in pts], r, 5, m, caps=True)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        cnt = max(1, int((b - a).length / every))
        for k in range(cnt + (1 if i == len(pts) - 2 else 0)):
            p = a.lerp(b, k / cnt)
            mb.pipe([p, p + n * standoff], r * 0.8, 4, "Metal_Dark", caps=False)

def conduits(mb, pts, offset_dir, n=3, r=0.08, spacing=0.22, mats=("Metal_Bare", "Metal_Copper", "Hull_Dark"),
             fillet_r=0.6, clamps_every=2.0):
    od = Vector(offset_dir).normalized()
    pts = [Vector(p) for p in pts]
    for i in range(n):
        off = od * spacing * (i - (n - 1) / 2)
        mb.pipe([p + off for p in pts], r, 8, mats[i % len(mats)], fillet_r=fillet_r)
    # clamps
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        cnt = max(1, int((b - a).length / clamps_every))
        d = (b - a).normalized()
        z = (od - d * od.dot(d)).normalized()
        x = d.cross(z)
        for k in range(1, cnt):
            p = a.lerp(b, k / cnt)
            M = Matrix.Identity(4)
            for r_ in range(3):
                M[r_][0], M[r_][1], M[r_][2] = x[r_], d[r_], z[r_]
            M.translation = p
            mb.box((r * 3.0, 0.12, spacing * n + r * 1.5), (0, 0, 0), "Metal_Dark", M)


# ------------------------------------------------------------------ RCS
NOZ_PROFILE = [(0.05, -0.03), (0.06, 0.0), (0.12, 0.20), (0.105, 0.20), (0.035, 0.03), (0.0, 0.03)]
NOZ_MATS = ["Metal_Dark", "Metal_Dark", "Metal_Bare", "Nozzle_Inner", "Nozzle_Inner"]

def rcs_nozzle(mb, pos, direction, scale=1.0, seg=8):
    M = look_mtx(pos, direction) @ Matrix.Scale(scale, 4)
    mb.revolve(NOZ_PROFILE, seg, NOZ_MATS, M)
    return Vector(pos) + Vector(direction).normalized() * 0.2 * scale

def rcs_cluster(mb, frame, scale=1.0, house="Hull_Grey"):
    """4-way RCS quad on a surface frame (X tangent, Y aft, Z radial).
    Returns [(tag, exit_pos, direction)] in module space; tags: AFT, FWD, TAN+, TAN-."""
    s = scale
    mb.box((0.80 * s, 0.80 * s, 0.22 * s), (0, 0, 0.11 * s), "Hull_Dark", frame, taper=0.9)
    mb.box((0.56 * s, 0.56 * s, 0.36 * s), (0, 0, 0.40 * s), house, frame, taper=0.86)
    mb.box((0.30 * s, 0.30 * s, 0.06 * s), (0, 0, 0.61 * s), "Metal_Dark", frame)
    R = frame.to_3x3()
    out = []
    zc = 0.40 * s
    for tag, ld in (("AFT", (0, 1, 0)), ("FWD", (0, -1, 0)), ("TAN+", (1, 0, 0)), ("TAN-", (-1, 0, 0))):
        ldv = Vector(ld)
        base = frame @ (ldv * 0.25 * s + Vector((0, 0, zc)))
        d = (R @ ldv).normalized()
        exit_p = rcs_nozzle(mb, base, d, s)
        out.append((tag, exit_p, d))
    return out

# ------------------------------------------------------------------ tanks
def pressure_tank(mb, mtx, r, length, seg=20, mat="MLI_Gold", strap_mat="Metal_Dark", straps=3, dome=0.55):
    """Capsule along local +Y (y from 0 to length) with elliptic domes and straps."""
    dl = r * dome
    prof = [(0.0, 0.0)]
    for k in range(1, 4):
        t = k / 4
        ang = t * math.pi / 2
        prof.append((r * math.sin(ang), dl * (1 - math.cos(ang))))
    body0, body1 = dl, length - dl
    prof.append((r, body0))
    mats = [mat] * 4
    for sidx in range(straps):
        yc = body0 + (body1 - body0) * (sidx + 0.5) / straps
        prof += [(r, yc - 0.15), (r + 0.05, yc - 0.12), (r + 0.05, yc + 0.12), (r, yc + 0.15)]
        mats += [mat, strap_mat, strap_mat, strap_mat]
    prof.append((r, body1))
    mats.append(mat)
    for k in range(1, 4):
        ang = k / 4 * math.pi / 2
        prof.append((r * math.cos(ang), body1 + dl * math.sin(ang)))
        mats.append(mat)
    prof.append((0.0, length))
    mats.append(mat)
    mb.revolve(prof, seg, mats, mtx)

# ------------------------------------------------------------------ lights / antennas
def nav_light(mb, pos, normal, color="Nav_White"):
    n = Vector(normal).normalized()
    M = look_mtx(pos, n)
    mb.revolve([(0.0, 0.0), (0.16, 0.0), (0.16, 0.06), (0.11, 0.06)], 8, "Metal_Dark", M)
    mb.revolve([(0.11, 0.06), (0.08, 0.14), (0.0, 0.17)], 8, color, M)
    return Vector(pos) + n * 0.2

def floodlight(mb, frame, aim=(0, -1, 0.3)):
    """Box flood light on a surface frame, aimed (local frame coords)."""
    mb.box((0.12, 0.12, 0.25), (0, 0, 0.125), "Metal_Dark", frame)
    aimv = Vector(aim).normalized()
    head = frame @ Vector((0, 0, 0.3))
    M = look_mtx(head, frame.to_3x3() @ aimv)
    mb.box((0.42, 0.22, 0.28), (0, 0, 0), "Hull_Dark", M)
    mb.box((0.36, 0.02, 0.22), (0, 0.115, 0), "Floodlight", M)

def dish(mb, mtx, R=1.2, depth=0.35, seg=16, mat="Hull_White"):
    """Parabolic dish opening toward local +Y, with feed horn and mount."""
    back = [(R * t, depth * t * t) for t in (0.0, 0.35, 0.7, 1.0)]
    th = 0.05
    front = [(R * t, depth * t * t + th) for t in (1.0, 0.7, 0.35, 0.0)]
    prof = back + [(R + 0.02, depth + th * 0.5)] + front
    mb.revolve(prof, seg, mat, mtx)
    f = depth * 1.4
    for k in range(3):
        a = TAU * k / 3
        mb.pipe([mtx @ polar(a, R * 0.95, depth), mtx @ Vector((0, f, 0))], 0.02, 4, "Metal_Dark", caps=False)
    mb.cyl(0.07, 0.18, 8, "Metal_Dark", mtx @ T(0, f - 0.09, 0))
    mb.cyl(0.10, 0.6, 8, "Metal_Dark", mtx @ T(0, -0.6, 0))


# ------------------------------------------------------------------ rectangular hulls
def rect_hull(mb, w, h, rc, cseg, y0, y1, grooves=(), livery=(), mat="Hull_White",
              groove_mat="Metal_Dark", livery_mat="Livery", depth=0.04, mtx=None):
    """Open rectangular hull tube from y0 to y1, with recessed seams (grooves) and livery bands."""
    def base(yc):
        return livery_mat if any(a <= yc <= b for a, b in livery) else mat
    seq = sorted([(g, "g") for g in grooves] + [(y, "l") for a, b in livery for y in (a, b)])
    pts, bands, cur = [(0.0, y0)], [], y0
    for y, kind in seq:
        if kind == "l":
            pts.append((0.0, y)); bands.append(base((cur + y) / 2)); cur = y
        else:
            pts += [(0.0, y - 0.06), (depth, y - 0.03), (depth, y + 0.03), (0.0, y + 0.06)]
            bands += [base((cur + y - 0.06) / 2), groove_mat, groove_mat, groove_mat]
            cur = y + 0.06
    pts.append((0.0, y1)); bands.append(base((cur + y1) / 2))
    return C.rect_sweep(mb, w, h, rc, cseg, pts, bands, mtx)

def rect_panels(mb, w, h, rc, cseg, y0, y1, sides=("top", "right", "left"), per_side=3, seed=5,
                mats=("Hull_Light", "Hull_Grey"), t=0.05):
    """Sparse raised access panels and vents on the flat sides (clean look)."""
    rnd = random.Random(seed)
    for side in sides:
        sw = C.side_width(side, w, h, rc)
        for _ in range(per_side):
            pw = rnd.uniform(0.25, 0.55) * sw
            pl = rnd.uniform(0.8, 2.4)
            u = rnd.uniform(-(sw - pw) / 2, (sw - pw) / 2) * 0.85
            yc = rnd.uniform(y0 + pl / 2 + 0.2, y1 - pl / 2 - 0.2)
            F = C.side_frame(side, w, h, yc, u)
            if rnd.random() < 0.3:   # vent: dark recess with slats
                mb.box((pw, pl, 0.03), (0, 0, 0.015), "Hull_Dark", F)
                nsl = max(3, int(pl / 0.18))
                for k in range(nsl):
                    yy = -pl / 2 + (k + 0.5) * pl / nsl
                    mb.box((pw * 0.92, 0.05, 0.05), (0, yy, 0.05), "Metal_Dark", F)
            else:
                mb.box((pw, pl, t), (0, 0, t / 2), rnd.choice(mats), F, taper=0.97)


def sphere(mb, center, r, seg=16, rings=8, mat="MLI_Gold"):
    prof = [(r * math.sin(math.pi * k / rings), -r * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    mb.revolve(prof, seg, mat, T(*center))

def eva_hatch(mb, frame, w=1.0, h=1.6, frame_w=0.09, mat="Hazard_Yellow"):
    """EVA hatch outline on a surface frame (X across, Y along axis)."""
    mb.box((w, h, 0.03), (0, 0, 0.015), "Hull_Grey", frame)
    for (sx, sy, x, y) in ((w, frame_w, 0, h / 2), (w, frame_w, 0, -h / 2), (frame_w, h, w / 2, 0), (frame_w, h, -w / 2, 0)):
        mb.box((sx, sy, 0.05), (x, y, 0.025), mat, frame)
    mb.box((0.18, 0.06, 0.06), (w * 0.3, 0, 0.06), "Metal_Bare", frame)


def window(mb, frame, w=0.9, h=0.6, glass="Window", frame_mat="Hull_Dark"):
    """Rectangular window (porthole) on a surface frame: X across, Y along the axis."""
    mb.box((w, h, 0.06), (0, 0, 0.03), frame_mat, frame)
    mb.box((w - 0.16, h - 0.16, 0.08), (0, 0, 0.04), glass, frame)

def mast(mb, frame, height=2.5, mat="Metal_Dark"):
    base = frame @ Vector((0, 0, 0))
    up = frame.to_3x3() @ Vector((0, 0, 1))
    side = frame.to_3x3() @ Vector((1, 0, 0))
    ax = frame.to_3x3() @ Vector((0, 1, 0))
    mb.box((0.4, 0.4, 0.2), (0, 0, 0.1), "Hull_Grey", frame)
    mb.pipe([base, base + up * height], 0.05, 6, mat)
    for k, hh in enumerate((height * 0.6, height * 0.9)):
        c = base + up * hh
        L = 0.7 - 0.25 * k
        mb.pipe([c - side * L, c + side * L], 0.025, 4, mat)
        mb.pipe([c - ax * L * 0.6, c + ax * L * 0.6], 0.025, 4, mat)
    nav_light(mb, base + up * height, up, "Nav_White")

def dome(mb, frame, r=0.8, mat="Hull_Dark", seg=16):
    M = frame @ Matrix.Rotation(-math.pi / 2, 4, "X")   # local +Y of revolve -> frame +Z
    mb.revolve([(0.0, -0.02), (r * 1.1, -0.02), (r * 1.1, 0.12)], seg, "Hull_Grey", M)
    prof = [(r * math.cos(math.pi / 2 * k / 4), 0.12 + r * math.sin(math.pi / 2 * k / 4)) for k in range(5)]
    mb.revolve(prof, seg, mat, M)


def pod_hatch(mb, frame, r=0.75, seg=16):
    """Round escape-pod hatch (hazard ring + recessed cap) on a surface frame."""
    M = frame @ Matrix.Rotation(-math.pi / 2, 4, "X")
    per = max(1, seg // 8)
    mb.revolve([(r * 0.78, 0.07), (r, 0.07), (r, 0.0)], seg,
               lambda i, j: ("Hazard_Yellow" if (j // per) % 2 == 0 else "Hazard_Black") if i == 0 else "Hull_Dark", M)
    mb.revolve([(0.0, 0.03), (r * 0.78, 0.03), (r * 0.78, 0.07)], seg, ["Hull_Grey", "Metal_Dark"], M)

def wall(mb, p0, p1, y0, y1, t=0.1, m="Int_Wall"):
    """Thin interior wall between two (x, z) points, spanning y0..y1."""
    d = Vector((p1[0] - p0[0], 0.0, p1[1] - p0[1]))
    L = d.length
    d.normalize()
    Y = Vector((0, 1, 0)); Z = d.cross(Y)
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2] = d[i], Y[i], Z[i]
    M.translation = Vector(((p0[0] + p1[0]) / 2, (y0 + y1) / 2, (p0[1] + p1[1]) / 2))
    mb.box((L, y1 - y0, t), (0, 0, 0), m, M)
    return M


def beam(mb, p0, p1, w=0.3, h=0.3, m="Metal_Dark", up=(0, 1, 0)):
    """Rectangular beam between two 3D points (local X along the beam)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    d.normalize()
    u = Vector(up)
    if abs(d.dot(u.normalized())) > 0.95:
        u = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
    z = d.cross(u).normalized(); y = z.cross(d)
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2] = d[i], y[i], z[i]
    M.translation = (p0 + p1) / 2
    mb.box((L, h, w), (0, 0, 0), m, M)
