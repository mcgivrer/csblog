#!/usr/bin/env python3
"""GLB -> glTF JSON converter for the STT shipyard viewer (Python 3 standard library only).

Why: artifact publishing refuses .glb files but accepts .json and .webp. This script splits a GLB into
  * <out>/<name>.json : the glTF JSON, with the binary buffer (geometry, animations) embedded as base64,
  * <out>/<images>/*  : every embedded image written as its own file (WebP, PNG or JPEG), referenced by URI.
Image bufferViews are dropped, the remaining ones are packed again (4-byte aligned) and accessor indices
are renumbered. Everything else (nodes, extras, materials, animations, extensions) is kept untouched.

Usage:
  python3 glb_to_gltf_json.py export/modules/STT_ModuleLibrary.glb viewer/
  python3 glb_to_gltf_json.py IN.glb OUT_DIR [--images lib] [--name STT_ModuleLibrary] [--check REFERENCE.json]

Typical pipeline: Blender  export_glb.run()  ->  this script  ->  viewer/STT_ModuleLibrary.json + viewer/lib/*.webp
"""
import argparse, base64, json, os, re, struct, sys

EXT = {"image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg", "image/ktx2": ".ktx2"}


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        sys.exit(f"{path}: not a glTF 2.0 binary file")
    gltf, binary, off = None, b"", 12
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b"JSON":
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == b"BIN\x00":
            binary = chunk
        off += 8 + clen
    if gltf is None:
        sys.exit(f"{path}: JSON chunk missing")
    return gltf, binary


def safe_name(name, used, ext):
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "image").strip("._") or "image"
    cand, n = base, 2
    while cand + ext in used:
        cand, n = f"{base}_{n}", n + 1
    used.add(cand + ext)
    return cand + ext


def convert(glb_path, out_dir, images_dir="lib", name=None):
    gltf, binary = read_glb(glb_path)
    name = name or os.path.splitext(os.path.basename(glb_path))[0]
    os.makedirs(os.path.join(out_dir, images_dir), exist_ok=True)
    views = gltf.get("bufferViews", [])

    # 1. write embedded images to files and point the image entries at them
    image_views, used, written = set(), set(), []
    for img in gltf.get("images", []):
        if "bufferView" not in img:
            continue
        bv = views[img["bufferView"]]
        start = bv.get("byteOffset", 0)
        blob = binary[start: start + bv["byteLength"]]
        fname = safe_name(img.get("name"), used, EXT.get(img.get("mimeType"), ".bin"))
        with open(os.path.join(out_dir, images_dir, fname), "wb") as f:
            f.write(blob)
        written.append((fname, len(blob)))
        image_views.add(img.pop("bufferView"))
        img.pop("mimeType", None)
        img["uri"] = f"{images_dir}/{fname}"

    # 2. pack the remaining bufferViews into a new buffer (4-byte aligned) and renumber them
    remap, new_views, packed = {}, [], bytearray()
    for i, bv in enumerate(views):
        if i in image_views:
            continue
        while len(packed) % 4:
            packed.append(0)
        start = bv.get("byteOffset", 0)
        chunk = binary[start: start + bv["byteLength"]]
        nbv = dict(bv)
        nbv["byteOffset"] = len(packed)
        packed += chunk
        remap[i] = len(new_views)
        new_views.append(nbv)
    for acc in gltf.get("accessors", []):
        if "bufferView" in acc:
            acc["bufferView"] = remap[acc["bufferView"]]
        sparse = acc.get("sparse")
        if sparse:
            for part in ("indices", "values"):
                sparse[part]["bufferView"] = remap[sparse[part]["bufferView"]]
    gltf["bufferViews"] = new_views

    # 3. embed the packed buffer as a base64 data URI
    gltf["buffers"] = [{"byteLength": len(packed),
                        "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(packed)).decode("ascii")}]
    out_path = os.path.join(out_dir, name + ".json")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(gltf, separators=(",", ":"), ensure_ascii=False))
    return out_path, written, len(packed)


def main():
    ap = argparse.ArgumentParser(description="Convert a GLB into glTF JSON (embedded buffer) + separate image files.")
    ap.add_argument("glb"); ap.add_argument("out_dir")
    ap.add_argument("--images", default="lib", help="image sub-folder, relative to out_dir (default: lib)")
    ap.add_argument("--name", default=None, help="output base name (default: GLB file name)")
    ap.add_argument("--check", default=None, help="reference .json to compare with, byte for byte")
    a = ap.parse_args()
    out, imgs, blen = convert(a.glb, a.out_dir, a.images, a.name)
    print(f"{out}  ({os.path.getsize(out) / 1e6:.2f} MB, buffer {blen / 1e6:.2f} MB, {len(imgs)} images in {a.images}/)")
    if a.check:
        same = open(out, "rb").read() == open(a.check, "rb").read()
        print("identical to reference" if same else "DIFFERENT from reference")
        sys.exit(0 if same else 1)


if __name__ == "__main__":
    main()
