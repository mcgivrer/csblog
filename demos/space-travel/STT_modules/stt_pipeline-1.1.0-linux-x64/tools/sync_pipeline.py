#!/usr/bin/env python3
"""Embed the STT Blender pipeline (scripts/*.py of the project) into the extension, as the package `pipeline`.

The scripts import each other by top-level names (`import stt_core as C`) and write to fixed folders. The copies
are rewritten so that they live inside the extension:
  * imports between pipeline modules become relative (`from . import stt_core as C`, `from .stt_core import T`),
    including the imports written inside functions;
  * texture generators read their output and font folders from STT_TEXTURES_OUT / STT_FONT_DIR, and their
    `if __name__ == "__main__":` block becomes a `main()` function the extension can call.
Folder constants (TEX_DIR, FLEET_JSON, EXPORT_DIR, RENDERS) are kept: the extension sets them from its preferences
before every run (see project.py), so the copies stay readable next to the originals.

Usage (from the extension source folder, or anywhere):
  python3 tools/sync_pipeline.py ~/Documents/Blender/space-travel/scripts  [extension_folder]
Standard library only. Re-run it after changing the project scripts, then rebuild the extension zip.
"""
import os, re, sys

SKIP = {"glb_to_gltf_json.py", "build_game_pack.py"}        # standalone tools: shipped in tools/ instead
GEN = {"gen_textures.py", "gen_fleet_decals.py", "gen_station_decals.py"}


def rewrite(name, src, mods):
    out = []
    for line in src.splitlines():
        m = re.match(r"^(\s*)import (.+?)\s*(#.*)?$", line)
        if m:
            parts = [p.strip() for p in m.group(2).split(",")]
            names = [p.split(" as ")[0].strip() for p in parts]
            inside = [n in mods for n in names]
            if all(inside):
                line = f"{m.group(1)}from . import {', '.join(parts)}"
            elif any(inside):
                raise SystemExit(f"{name}: mixed import, split it by hand: {line.strip()}")
        m = re.match(r"^(\s*)from (\w+) import (.+)$", line)
        if m and m.group(2) in mods:
            line = f"{m.group(1)}from .{m.group(2)} import {m.group(3)}"
        out.append(line)
    text = "\n".join(out) + "\n"
    if name in GEN:
        text = re.sub(r'^OUT = "[^"]*"', 'OUT = os.environ.get("STT_TEXTURES_OUT", "textures")', text, flags=re.M)
        text = re.sub(r'^FONT_DIR = "[^"]*"', 'FONT_DIR = os.environ.get("STT_FONT_DIR", "fonts")', text, flags=re.M)
        if "import os" not in text and "os.environ" in text:
            text = text.replace("import json, math\n", "import json, math, os\n", 1)
        if 'if __name__ == "__main__":' in text:
            text = text.replace('if __name__ == "__main__":', "def main():", 1) + '\n\nif __name__ == "__main__":\n    main()\n'
    return text


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src_dir = os.path.expanduser(sys.argv[1])
    ext_dir = os.path.expanduser(sys.argv[2]) if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dst = os.path.join(ext_dir, "pipeline")
    os.makedirs(dst, exist_ok=True)
    files = sorted(f for f in os.listdir(src_dir) if f.endswith(".py") and f not in SKIP)
    mods = {f[:-3] for f in files}
    for f in os.listdir(dst):
        if f.endswith(".py") and f != "__init__.py" and f not in files:
            os.remove(os.path.join(dst, f))
    for f in files:
        with open(os.path.join(src_dir, f), encoding="utf-8") as fh:
            text = rewrite(f, fh.read(), mods)
        with open(os.path.join(dst, f), "w", encoding="utf-8") as fh:
            fh.write(text)
    with open(os.path.join(dst, "__init__.py"), "w", encoding="utf-8") as fh:
        fh.write('"""STT pipeline, embedded copy of the project scripts (tools/sync_pipeline.py). Do not edit here."""\n'
                 f"MODULES = {sorted(mods)!r}\n")
    print(f"{len(files)} scripts embedded in {dst}")


if __name__ == "__main__":
    main()
