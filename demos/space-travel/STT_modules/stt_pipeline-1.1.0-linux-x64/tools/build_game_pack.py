#!/usr/bin/env python3
"""Module pack for the game "Space Travel & Transport" (Python 3 + Pillow, gltfpack through Node).

Turns the Blender module library into the files that the game build (sources/build.py) embeds in the single HTML:
  <out>/stt_modules.glb   module library compressed with gltfpack (EXT_meshopt_compression, float attributes,
                          node names, materials and extras kept), heavy textures reduced
  <out>/stt_fleet.json    companies, container brands, station zones and module metadata (fleet.json subset)
  <out>/img/*.webp        company decal atlases (1024 px) and container brand sheets, used for liveries

Usage (from ~/Documents/Blender/space-travel):
  python3 scripts/build_game_pack.py --out ~/Projects/web/csblog/demos/space-travel/sources/src/assets
Options:
  --glb  export/modules/STT_ModuleLibrary.glb   (or the viewer's STT_ModuleLibrary.json, with its lib/ images)
  --fleet fleet.json   --tex viewer/tex (WebP or PNG atlases; textures/ works too)   --gltfpack "npx --yes gltfpack@0.21"
  --max-tile 512  (side of the tiling MLI textures)   --max-decal 1024  (side of decal atlases)
  --no-gltfpack  write an uncompressed GLB (no Node needed; about twice as big)
Also importable: build(glb, fleet, tex, out, gltfpack=..., log=print) -> summary dict (used by the Blender extension).

Notes
  * gltfpack runs with -kn -km -ke (named nodes, materials and extras are kept: SOCKET_*, RCS_*, VFX_*, NAVLIGHT_*,
    STT_<KEY>_ROOT, stt_mass_t...) and -vtf (float texture coordinates, so no extra KHR_texture_transform on the UVs).
    Positions (14 bits, dequantised by a node transform) and normals (8 bits, normalised) stay quantised: the game's
    merge (09c-vaisseaux-modulaires.js) reads them back to floats. Measured: 8.4 MB -> about 3.5 MB with the liveries.
  * The script checks that every named node of the source is still present in the output.
  * Without Node / gltfpack (or with --no-gltfpack), the pack is written uncompressed (images still reduced):
    the game reads it the same way.
"""
import argparse, base64, io, json, os, re, shlex, shutil, struct, subprocess, sys, tempfile

try:
    from PIL import Image
except ImportError:          # images are then copied without resizing
    Image = None

EXT = {"image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg"}
FLEET_KEYS = ("version", "units", "axes", "companies", "container_brands", "zones", "modules", "station_rule")


def read_library(path):
    """GLB or glTF JSON (embedded buffer, external images) -> (gltf dict, binary buffer, base dir)."""
    data = open(path, "rb").read()
    if data[:4] == b"glTF":
        _, version, length = struct.unpack_from("<4sII", data, 0)
        gltf, binary, off = None, b"", 12
        while off < length:
            clen, ctype = struct.unpack_from("<I4s", data, off)
            chunk = data[off + 8: off + 8 + clen]
            if ctype == b"JSON":
                gltf = json.loads(chunk.decode("utf-8"))
            elif ctype == b"BIN\x00":
                binary = chunk
            off += 8 + clen
        return gltf, binary, os.path.dirname(path)
    gltf = json.loads(data.decode("utf-8"))
    uri = gltf["buffers"][0]["uri"]
    binary = base64.b64decode(uri.split(",", 1)[1]) if uri.startswith("data:") else open(os.path.join(os.path.dirname(path), uri), "rb").read()
    return gltf, binary, os.path.dirname(path)


def resize(blob, max_side, quality=85, alpha_quality=100):
    """Reduce an image to max_side (WebP). Returns the original bytes when nothing has to change."""
    if Image is None:
        return blob, None
    im = Image.open(io.BytesIO(blob))
    if max(im.size) <= max_side:
        return blob, im.size
    k = max_side / max(im.size)
    im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
    return out.getvalue(), im.size


def limit_for(name, a):
    if name.startswith("mli_"):
        return a.max_tile
    if name.startswith("decals_"):
        return a.max_decal
    return 4096


def prepare(a, tmp):
    """Writes tmp/lib.gltf + tmp/lib.bin + tmp/img/* with the reduced images."""
    gltf, binary, base = read_library(a.glb)
    views, keep = gltf.get("bufferViews", []), []
    os.makedirs(os.path.join(tmp, "img"), exist_ok=True)
    image_views, used = set(), set()
    for img in gltf.get("images", []):
        if "bufferView" in img:
            bv = views[img["bufferView"]]
            blob = binary[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
            image_views.add(img.pop("bufferView"))
            ext = EXT.get(img.pop("mimeType", ""), ".bin")
        else:
            blob = open(os.path.join(base, img["uri"]), "rb").read()
            ext = os.path.splitext(img["uri"])[1]
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", img.get("name") or "image")
        n, k = name, 2
        while n in used:
            n, k = f"{name}_{k}", k + 1
        used.add(n)
        blob2, size = resize(blob, limit_for(n, a), *((78, 60) if n.startswith("decals_") else (85, 100)))
        if blob2 is not blob:
            ext = ".webp"
        fname = f"img/{n}{ext}"
        open(os.path.join(tmp, fname), "wb").write(blob2)
        img["uri"] = fname
        keep.append((n, len(blob), len(blob2), size))
    # buffer without the image views (offsets renumbered)
    remap, new_views, packed = {}, [], bytearray()
    for i, bv in enumerate(views):
        if i in image_views:
            continue
        while len(packed) % 4:
            packed.append(0)
        s = bv.get("byteOffset", 0)
        nbv = dict(bv, byteOffset=len(packed))
        packed += binary[s: s + bv["byteLength"]]
        remap[i] = len(new_views)
        new_views.append(nbv)
    for acc in gltf.get("accessors", []):
        if "bufferView" in acc:
            acc["bufferView"] = remap[acc["bufferView"]]
        if acc.get("sparse"):
            for part in ("indices", "values"):
                acc["sparse"][part]["bufferView"] = remap[acc["sparse"][part]["bufferView"]]
    gltf["bufferViews"] = new_views
    dedupe_textures(gltf)
    gltf["buffers"] = [{"byteLength": len(packed), "uri": "lib.bin"}]
    open(os.path.join(tmp, "lib.bin"), "wb").write(packed)
    json.dump(gltf, open(os.path.join(tmp, "lib.gltf"), "w", encoding="utf-8"))
    return gltf, keep


def dedupe_textures(gltf):
    """Une entrée de texture par couple (image, échantillonneur). Blender en écrit une par emploi (584 pour 32 images) :
    sans gltfpack pour les fusionner, le jeu décoderait chaque image autant de fois."""
    texs = gltf.get("textures", [])
    keymap, new, remap = {}, [], {}
    for i, t in enumerate(texs):
        k = json.dumps(t, sort_keys=True)
        if k not in keymap:
            keymap[k] = len(new); new.append(t)
        remap[i] = keymap[k]

    def walk(o, parent_key=""):
        if isinstance(o, dict):
            if "index" in o and parent_key.endswith("Texture") and isinstance(o["index"], int):
                o["index"] = remap.get(o["index"], o["index"])
            for k, v in o.items():
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, parent_key)
    walk(gltf.get("materials", []))
    gltf["textures"] = new
    return len(texs), len(new)


def glb_json(path):
    d = open(path, "rb").read()
    l = struct.unpack_from("<I", d, 12)[0]
    return json.loads(d[20: 20 + l])


def write_glb(tmp, out_glb):
    """Uncompressed fallback: tmp/lib.gltf + lib.bin + img/* -> one self-contained GLB (images as buffer views)."""
    gltf = json.load(open(os.path.join(tmp, "lib.gltf"), encoding="utf-8"))
    binary = bytearray(open(os.path.join(tmp, "lib.bin"), "rb").read())
    mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}
    for img in gltf.get("images", []):
        uri = img.pop("uri", None)
        if not uri:
            continue
        blob = open(os.path.join(tmp, uri), "rb").read()
        while len(binary) % 4:
            binary.append(0)
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(blob)})
        binary += blob
        img["bufferView"] = len(gltf["bufferViews"]) - 1
        img["mimeType"] = mime.get(os.path.splitext(uri)[1].lower(), "image/png")
    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"] = [{"byteLength": len(binary)}]
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    with open(out_glb, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(binary)))
        f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00")); f.write(binary)


class _Args:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def build(glb, fleet, tex, out, gltfpack="npx --yes gltfpack@0.21", max_tile=512, max_decal=1024, compress=True, log=print):
    """Writes the pack into `out`. Returns {'glb': MB, 'compressed': bool, 'images': n, 'total': MB, 'warning': str|None}."""
    a = _Args(glb=glb, fleet=fleet, tex=tex, out=out, gltfpack=gltfpack, max_tile=max_tile, max_decal=max_decal)
    os.makedirs(os.path.join(out, "img"), exist_ok=True)
    warning = None
    if Image is None:
        warning = "Pillow absent : images copiées sans réduction"
        log(warning)
    out_glb = os.path.join(out, "stt_modules.glb")
    with tempfile.TemporaryDirectory() as tmp:
        src, imgs = prepare(a, tmp)
        done = False
        if compress and gltfpack:
            cmd = shlex.split(gltfpack) + ["-i", os.path.join(tmp, "lib.gltf"), "-o", out_glb, "-kn", "-km", "-ke", "-cc", "-vtf"]
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
                done = r.returncode == 0
                if not done:
                    warning = "gltfpack a échoué : pack non compressé. " + (r.stderr or r.stdout).strip()[-300:]
            except (OSError, subprocess.TimeoutExpired) as e:
                warning = f"gltfpack introuvable ({e.__class__.__name__}) : pack non compressé. Installe Node pour le compresser."
        if not done:
            if warning:
                log(warning)
            write_glb(tmp, out_glb)
    names_in = {n.get("name") for n in src["nodes"] if n.get("name")}
    names_out = {n.get("name") for n in glb_json(out_glb)["nodes"] if n.get("name")}
    lost = sorted(names_in - names_out)
    if lost:
        raise RuntimeError(f"{len(lost)} nœuds nommés perdus par gltfpack, par ex. {lost[:6]}")
    # liveries: company decal atlases and container brand sheets (WebP or PNG). decals_STT and containers_VESTA are
    # already in the library (materials STT_Decals_STT and STT_ContDecals_VESTA): the game reads them from there.
    extra = []
    for f in sorted(os.listdir(tex)):
        m = re.match(r"((decals|containers)_[A-Z0-9]+)\.(webp|png)$", f)
        if not m or m.group(1) in ("decals_STT", "containers_VESTA"):
            continue
        name = m.group(1) + ".webp"
        if any(e[0] == name for e in extra):
            continue
        blob = open(os.path.join(tex, f), "rb").read()
        if f.endswith(".png") and Image is not None:
            im = Image.open(io.BytesIO(blob)); b = io.BytesIO(); im.save(b, "WEBP", quality=85, method=6); blob = b.getvalue()
        blob2, _ = resize(blob, max_decal, 78, 60) if f.startswith("decals_") else resize(blob, 1024)
        open(os.path.join(out, "img", name), "wb").write(blob2)
        extra.append((name, len(blob2)))
    data = json.load(open(fleet, encoding="utf-8"))
    sub = {k: data[k] for k in FLEET_KEYS if k in data}
    json.dump(sub, open(os.path.join(out, "stt_fleet.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    total = os.path.getsize(out_glb) + sum(s for _, s in extra) + os.path.getsize(os.path.join(out, "stt_fleet.json"))
    log(f"{out_glb}: {os.path.getsize(out_glb) / 1e6:.2f} Mo ({len(names_out)} nœuds nommés gardés, {'compressé' if done else 'non compressé'})")
    for n, s0, s1, size in imgs:
        if s1 != s0:
            log(f"  {n}: {s0 // 1024} -> {s1 // 1024} Ko {size}")
    log(f"{len(extra)} images de livrées, pack total {total / 1e6:.2f} Mo (environ {total * 4 / 3 / 1e6:.1f} Mo en base64)")
    return {"glb": round(os.path.getsize(out_glb) / 1e6, 2), "compressed": done, "images": len(extra), "total": round(total / 1e6, 2), "warning": warning}


def main():
    ap = argparse.ArgumentParser(description="Build the STT module pack embedded in the game HTML.")
    ap.add_argument("--glb", default="export/modules/STT_ModuleLibrary.glb")
    ap.add_argument("--fleet", default="fleet.json")
    ap.add_argument("--tex", default="viewer/tex", help="folder with decals_<CO> and containers_<BRAND> atlases (WebP or PNG)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--gltfpack", default="npx --yes gltfpack@0.21")
    ap.add_argument("--no-gltfpack", action="store_true", help="write an uncompressed GLB")
    ap.add_argument("--max-tile", type=int, default=512)
    ap.add_argument("--max-decal", type=int, default=1024)
    a = ap.parse_args()
    try:
        build(a.glb, a.fleet, a.tex, a.out, a.gltfpack, a.max_tile, a.max_decal, compress=not a.no_gltfpack)
    except RuntimeError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
