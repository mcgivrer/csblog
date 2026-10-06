#!/usr/bin/env python3
"""modules-geom.json : geometric data of the STT modules, read from the module library (Python 3, standard library only).

Reads STT_ModuleLibrary.json (uncompressed glTF, float vertex buffer, the same input as the editor) or a GLB, and writes
sources/src/data/modules-geom.json, embedded by the game build and read by shared/sttcomp.js (STTCOMP).

Per module <KEY> (root node STT_<KEY>_ROOT), all matrices are 16 floats, column-major, relative to the root
(like relMatrix in the editor), glTF axes, metres, 6 decimals:
  mass_t, length_m  extras stt_mass_t / stt_length_m
  ports             SOCKET_<KEY>_<PORT> (editor order), sockets  {port: matrix}
  containers        [{slot, m}] SOCKET_[CRG6_]CONTAINER_<slot>, sorted by node name
  hull              [minx,miny,minz,maxx,maxy,maxz] of the static meshes (DYNAMIC subtrees excluded, as in the editor)
  full              same box with the animated parts, at the pose stored in the file (boxes of the geometry, transformed)
  exhaust           VFX_<KEY>_MAIN_EXHAUST (PROP only)
container.hull      box of STT_CARGO_Container*.
Exact boxes need float vertices; a compressed input (EXT_meshopt_compression) falls back on accessor min/max (warning).

Usage: python3 STT_modules/build_modules_geom.py [--glb STT_modules/sources/STT_ModuleLibrary.json] [--out <file>]
"""
import argparse, hashlib, json, math, os, re, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_game_pack import read_library  # noqa: E402

DEFAULT_GLB = os.path.join(HERE, "sources", "STT_ModuleLibrary.json")
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "sources", "src", "data", "modules-geom.json"))
DYNAMIC = re.compile(r"SolarGimbal|Radiator_|DoorMech|DoorField|Nozzle|_Int_")
PORT_PREF = ["AFT", "PORT", "STBD", "TOP", "BOT", "FWD", "DORSAL", "SHUTTLE", "PAD"]
I4 = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def mul(a, b):
    """column-major 4x4 product a*b."""
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def inv_affine(m):
    """inverse of an affine column-major matrix."""
    a, b, c, d, e, f, g, h, i = m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    r = [(e * i - f * h) / det, -(b * i - c * h) / det, (b * f - c * e) / det,
         -(d * i - f * g) / det, (a * i - c * g) / det, -(a * f - c * d) / det,
         (d * h - e * g) / det, -(a * h - b * g) / det, (a * e - b * d) / det]
    tx, ty, tz = m[12], m[13], m[14]
    return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0,
            -(r[0] * tx + r[1] * ty + r[2] * tz), -(r[3] * tx + r[4] * ty + r[5] * tz),
            -(r[6] * tx + r[7] * ty + r[8] * tz), 1.0]


def local(n):
    if "matrix" in n:
        return [float(v) for v in n["matrix"]]
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = n.get("scale", [1, 1, 1])
    tx, ty, tz = n.get("translation", [0, 0, 0])
    return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
            (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
            (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1.0]


def rnd(v):
    return round(v, 6) + 0.0


def rmat(m):
    return [rnd(v) for v in m]


def xform(m, q):
    return [m[0 + c] * q[0] + m[4 + c] * q[1] + m[8 + c] * q[2] + m[12 + c] for c in range(3)]


class Box:
    def __init__(self):
        self.lo, self.hi = [math.inf] * 3, [-math.inf] * 3

    def add(self, p):
        for i in range(3):
            self.lo[i] = min(self.lo[i], p[i])
            self.hi[i] = max(self.hi[i], p[i])

    def add_box(self, lo, hi, m):
        for i in range(8):
            self.add(xform(m, [hi[k] if i >> k & 1 else lo[k] for k in range(3)]))

    def out(self):
        return [rnd(v) for v in self.lo + self.hi] if self.lo[0] != math.inf else [0.0] * 6


class Lib:
    def __init__(self, path):
        self.g, self.bin, _ = read_library(path)
        self.n = self.g["nodes"]
        self.warned = False
        self.cache = {}

    def prim_bounds(self, acc_i):
        """(float vertices | None, min, max) of a POSITION accessor."""
        if acc_i in self.cache:
            return self.cache[acc_i]
        a = self.g["accessors"][acc_i]
        bv = self.g["bufferViews"][a["bufferView"]] if "bufferView" in a else None
        compressed = bv is not None and "EXT_meshopt_compression" in (bv.get("extensions") or {})
        ok = bv is not None and not compressed and a["componentType"] == 5126 and not a.get("normalized") and not a.get("sparse")
        if ok:
            stride = bv.get("byteStride") or 12
            off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
            pts = [struct.unpack_from("<3f", self.bin, off + i * stride) for i in range(a["count"])]
            r = (pts, [min(q[k] for q in pts) for k in range(3)], [max(q[k] for q in pts) for k in range(3)])
        else:
            if not self.warned:
                print("WARNING: compressed or quantised vertex data, boxes fall back on accessor min/max (majorated)", file=sys.stderr)
                self.warned = True
            r = (None, a["min"], a["max"])
        self.cache[acc_i] = r
        return r

    def walk(self, i, m, root, static_only, box):
        """Visits the subtree of node i (matrix m relative to the root), adding mesh boxes."""
        n = self.n[i]
        if i != root and static_only and DYNAMIC.search(n.get("name", "")):
            return
        if "mesh" in n:
            for p in self.g["meshes"][n["mesh"]]["primitives"]:
                pts, lo, hi = self.prim_bounds(p["attributes"]["POSITION"])
                if static_only and pts is not None:   # exact vertices (merged static meshes)
                    for q in pts:
                        box.add(xform(m, q))
                else:                                 # Box3.setFromObject (non precise): geometry box, transformed
                    box.add_box(lo, hi, m)
        for c in n.get("children", []):
            self.walk(c, mul(m, local(self.n[c])), root, static_only, box)


def build(path):
    L = Lib(path)
    n = L.n
    parent = {c: i for i, nd in enumerate(n) for c in nd.get("children", [])}
    world = {}

    def w(i):
        if i not in world:
            world[i] = mul(w(parent[i]), local(n[i])) if i in parent else local(n[i])
        return world[i]

    def rel(root, i):
        return mul(inv_affine(w(root)), w(i))

    def subtree(i):
        out = [i]
        for c in n[i].get("children", []):
            out += subtree(c)
        return out

    roots, container = {}, None
    for i, nd in enumerate(n):
        nm = nd.get("name", "")
        if i in parent:
            continue
        mm = re.match(r"STT_([A-Z0-9]+)_ROOT$", nm)
        if mm:
            roots[mm.group(1)] = i
        elif nm.startswith("STT_CARGO_Container") and (container is None or nm < n[container]["name"]):
            container = i

    modules = {}
    for key in sorted(roots):
        r = roots[key]
        ex = n[r].get("extras", {})
        pre = f"SOCKET_{key}_"
        ports, socks, conts, exhaust = [], {}, [], None
        for i in subtree(r):
            nm = n[i].get("name", "")
            if nm.startswith(pre) and not nm[len(pre):].startswith("CONTAINER"):
                p = nm[len(pre):]
                ports.append(p)
                socks[p] = rmat(rel(r, i))
            mm = re.match(r"SOCKET_(?:CRG6_)?CONTAINER_(.*)$", nm)
            if mm:
                conts.append((nm, {"slot": mm.group(1), "m": rmat(rel(r, i))}))
            if nm == f"VFX_{key}_MAIN_EXHAUST":
                exhaust = rmat(rel(r, i))
        ports.sort(key=lambda p: PORT_PREF.index(p) if p in PORT_PREF else -1)   # stable, like the editor
        hull, full = Box(), Box()
        L.walk(r, I4, r, True, hull)
        L.walk(r, I4, r, False, full)
        mod = {"mass_t": ex.get("stt_mass_t", 0), "length_m": ex.get("stt_length_m", 0), "ports": ports,
               "sockets": dict(sorted(socks.items())), "containers": [c for _, c in sorted(conts, key=lambda t: t[0])],
               "hull": hull.out(), "full": full.out()}
        if exhaust:
            mod["exhaust"] = exhaust
        modules[key] = mod
    ch = Box()
    if container is not None:
        L.walk(container, I4, container, True, ch)
    return {"format": "stt-modules-geom", "version": 1, "source": os.path.basename(path),
            "sha1": hashlib.sha1(open(path, "rb").read()).hexdigest(), "axes": "gltf", "units": "m",
            "modules": modules, "container": {"hull": ch.out()}}


def write(glb, out):
    data = build(glb)
    text = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(text + "\n")
    print(f"{out}: {len(text) + 1} bytes, {len(data['modules'])} modules")
    return data


def main():
    ap = argparse.ArgumentParser(description="Build modules-geom.json from the STT module library.")
    ap.add_argument("--glb", default=DEFAULT_GLB)
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args()
    write(a.glb, a.out)


if __name__ == "__main__":
    main()
