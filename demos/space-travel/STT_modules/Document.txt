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
  --fleet fleet.json   --tex viewer/tex   --gltfpack "npx --yes gltfpack@0.21"
  --max-tile 512  (side of the tiling MLI textures)   --max-decal 1024  (side of decal atlases)

Notes
  * gltfpack runs with -kn -km -ke (named nodes, materials and extras are kept: SOCKET_*, RCS_*, VFX_*, NAVLIGHT_*,
    STT_<KEY>_ROOT, stt_mass_t...) and -vtf (float texture coordinates, so no extra KHR_texture_transform on the UVs).
    Positions (14 bits, dequantised by a node transform) and normals (8 bits, normalised) stay quantised: the game's
    merge (09c-vaisseaux-modulaires.js) reads them back to floats. Measured: 8.4 MB -> about 3.5 MB with the liveries.
  * The script checks that every named node of the source is still present in the output.
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
    gltf["buffers"] = [{"byteLength": len(packed), "uri": "lib.bin"}]
    open(os.path.join(tmp, "lib.bin"), "wb").write(packed)
    json.dump(gltf, open(os.path.join(tmp, "lib.gltf"), "w", encoding="utf-8"))
    return gltf, keep


def glb_json(path):
    d = open(path, "rb").read()
    l = struct.unpack_from("<I", d, 12)[0]
    return json.loads(d[20: 20 + l])


def main():
    ap = argparse.ArgumentParser(description="Build the STT module pack embedded in the game HTML.")
    ap.add_argument("--glb", default="export/modules/STT_ModuleLibrary.glb")
    ap.add_argument("--fleet", default="fleet.json")
    ap.add_argument("--tex", default="viewer/tex", help="folder with decals_<CO>.webp and containers_<BRAND>.webp")
    ap.add_argument("--out", required=True)
    ap.add_argument("--gltfpack", default="npx --yes gltfpack@0.21")
    ap.add_argument("--max-tile", type=int, default=512)
    ap.add_argument("--max-decal", type=int, default=1024)
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    if Image is None:
        print("Pillow not found: images are copied without resizing")

    with tempfile.TemporaryDirectory() as tmp:
        src, imgs = prepare(a, tmp)
        out_glb = os.path.join(a.out, "stt_modules.glb")
        cmd = shlex.split(a.gltfpack) + ["-i", os.path.join(tmp, "lib.gltf"), "-o", out_glb,
                                         "-kn", "-km", "-ke", "-cc", "-vtf"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            sys.exit("gltfpack failed:\n" + r.stdout + r.stderr)

    # every named node must survive (sockets, RCS, VFX, nav lights, module roots)
    names_in = {n.get("name") for n in src["nodes"] if n.get("name")}
    names_out = {n.get("name") for n in glb_json(out_glb)["nodes"] if n.get("name")}
    lost = sorted(names_in - names_out)
    if lost:
        sys.exit(f"{len(lost)} named nodes lost by gltfpack, e.g. {lost[:6]}")

    # liveries: company decal atlases and container brand sheets. decals_STT and containers_VESTA are already in the
    # library (materials STT_Decals_STT and STT_ContDecals_VESTA): the game reads them from there.
    extra = []
    for f in sorted(os.listdir(a.tex)):
        if not re.match(r"(decals|containers)_[A-Z0-9]+\.webp$", f) or f in ("decals_STT.webp", "containers_VESTA.webp"):
            continue
        blob = open(os.path.join(a.tex, f), "rb").read()
        blob2, _ = resize(blob, a.max_decal, 78, 60) if f.startswith("decals_") else resize(blob, 1024)
        open(os.path.join(a.out, "img", f), "wb").write(blob2)
        extra.append((f, len(blob2)))

    fleet = json.load(open(a.fleet, encoding="utf-8"))
    sub = {k: fleet[k] for k in FLEET_KEYS if k in fleet}
    json.dump(sub, open(os.path.join(a.out, "stt_fleet.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    total = os.path.getsize(out_glb) + sum(s for _, s in extra) + os.path.getsize(os.path.join(a.out, "stt_fleet.json"))
    print(f"{out_glb}: {os.path.getsize(out_glb) / 1e6:.2f} MB ({len(names_out)} named nodes kept)")
    for n, s0, s1, size in imgs:
        if s1 != s0:
            print(f"  {n}: {s0 // 1024} -> {s1 // 1024} KB {size}")
    print(f"{len(extra)} livery images, total pack {total / 1e6:.2f} MB (about {total * 4 / 3 / 1e6:.1f} MB once embedded in base64)")


if __name__ == "__main__":
    main()
