# SPDX-License-Identifier: GPL-3.0-or-later
"""Éditeur « Chantier naval STT » en un seul fichier HTML, lançable sans serveur (double-clic, file://).

Le fichier produit embarque :
  * Three.js r169 et ses modules (vendor/three-0.169.0-stt.min.js, global window.STT3) à la place du CDN ;
  * les polices Barlow Condensed et IBM Plex (vendor/stt-fonts.css) à la place de Google Fonts ;
  * la bibliothèque de modules (STT_ModuleLibrary.json et ses images lib/), les atlas tex/, fleet.json
    et les images du manuel, servis à l'éditeur sous forme d'URL blob: (window.STT_EMBED).

Python 3.8+ sans dépendance : s'exécute dans Blender (extension STT Pipeline, étape « Viewer autonome »)
ou en ligne de commande :

    python3 build_viewer_standalone.py [dossier_viewer] [-o sortie.html] [--no-manual]

Le dossier viewer doit contenir index.html (éditeur v11 ou plus récent) et les fichiers écrits par l'étape
« Viewer » : STT_ModuleLibrary.json, lib/, tex/, fleet.json, manual/.
"""
import argparse
import base64
import datetime
import glob
import json
import os
import re
import sys

OUT_NAME = "chantier_naval_stt_autonome.html"
MIME = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".json": "application/json", ".bin": "application/octet-stream", ".ktx2": "image/ktx2"}
HERE = os.path.dirname(os.path.abspath(__file__))

# Exécuté avant Three.js et l'éditeur : chaque fichier embarqué devient une URL blob:, que l'éditeur
# obtient par window.STT_EMBED.url(chemin) (fetch, LoadingManager de Three.js, images).
LOADER_JS = r"""(() => {
  const map = {};
  for (const el of document.querySelectorAll('script[data-stt-file]')) {
    const type = el.dataset.type || 'application/octet-stream';
    let data = el.textContent;
    if (el.hasAttribute('data-b64')) {
      const bin = atob(data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      data = u8;
    }
    map[el.dataset.sttFile] = URL.createObjectURL(new Blob([data], { type }));
    el.remove();
  }
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const key = (u) => {
    u = String(u);
    if (u.startsWith(base)) u = u.slice(base.length);
    u = u.replace(/[#?].*$/, '').replace(/^(\.\/)+/, '');
    try { u = decodeURI(u); } catch (e) { /* chemin laissé tel quel */ }
    return u;
  };
  window.STT_EMBED = { url: (u) => map[key(u)] || u, files: () => Object.keys(map) };
})();"""


def log_default(msg):
    print(msg)


def _read(path, mode="r"):
    with open(path, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
        return f.read()


def find_vendor(viewer_dir, vendor=None):
    """Dossier contenant three-*-stt.min.js : vendor/ du viewer, puis celui du script (extension ou projet)."""
    cands = [vendor] if vendor else []
    cands += [os.path.join(viewer_dir, "vendor"), os.path.join(HERE, "vendor"),
              os.path.join(HERE, "..", "vendor"), os.path.join(HERE, "..", "viewer", "vendor")]
    for d in cands:
        if d and glob.glob(os.path.join(d, "three-*-stt.min.js")):
            return os.path.abspath(d)
    raise RuntimeError("bundle Three.js introuvable (vendor/three-0.169.0-stt.min.js)")


def bundle_exports(js):
    """Noms exportés par le bundle, lus dans son en-tête « window.STT3 = { … } »."""
    m = re.search(r"window\.STT3\s*=\s*\{([^}]*)\}", js[:2000])
    if not m:
        raise RuntimeError("en-tête du bundle Three.js illisible (window.STT3 = { … } attendu)")
    return {n.strip() for n in m.group(1).split(",") if n.strip()}


def wrap_document(html):
    """Le source de l'artefact n'a pas de squelette : on ajoute celui de la publication."""
    if re.search(r"<html[\s>]", html[:4000], re.I):
        return html
    return ('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
            '</head><body>' + html + '</body></html>')


def rewrite_imports(module_js, exports):
    """import … from 'three' / 'three/addons/…' → lecture du global STT3 (même instance de Three.js)."""
    used = set()

    def star(m):
        used.add("THREE")
        return f"const {m.group(1)} = STT3.THREE;"

    def named(m):
        parts = []
        for spec in m.group(1).split(","):
            spec = spec.strip()
            if not spec:
                continue
            a, _, b = spec.partition(" as ")
            a, b = a.strip(), b.strip()
            used.add(a)
            parts.append(f"{a}: {b}" if b else a)
        return "const { " + ", ".join(parts) + " } = STT3;"

    js = re.sub(r"^import\s+\*\s+as\s+(\w+)\s+from\s+['\"]three['\"];?", star, module_js, flags=re.M)
    js = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*['\"]three(?:/addons/[^'\"]+)?['\"];?", named, js, flags=re.M)
    left = re.findall(r"^import\s.*$", js, flags=re.M)
    if left:
        raise RuntimeError("imports non pris en charge : " + " | ".join(left[:3]))
    missing = sorted(used - exports)
    if missing:
        raise RuntimeError("absents du bundle Three.js : " + ", ".join(missing)
                           + " (reconstruis vendor/three-*-stt.min.js, voir vendor/LISEZMOI.md)")
    return js, used


def locate(dirs, rel):
    """Premier dossier contenant le chemin relatif (viewer du projet, puis dossier de l'éditeur source)."""
    for d in dirs:
        p = os.path.join(d, rel)
        if os.path.isfile(p):
            return p
    return None


def collect_files(dirs, manual=True, html=""):
    """Chemins relatifs à embarquer (les données viennent du premier dossier), avec contrôle de présence."""
    viewer_dir = dirs[0]
    need, missing = [], []
    lib = os.path.join(viewer_dir, "STT_ModuleLibrary.json")
    for f in ("fleet.json", "STT_ModuleLibrary.json"):
        (need if os.path.isfile(os.path.join(viewer_dir, f)) else missing).append(f)
    if os.path.isfile(lib):
        g = json.loads(_read(lib))
        for item in g.get("images", []) + g.get("buffers", []):
            uri = item.get("uri", "")
            if uri and not uri.startswith("data:"):
                (need if os.path.isfile(os.path.join(viewer_dir, uri)) else missing).append(uri)
    for f in sorted(glob.glob(os.path.join(viewer_dir, "tex", "*.webp"))):
        need.append("tex/" + os.path.basename(f))
    if manual:
        for uri in sorted(set(re.findall(r'data-src="([^"]+)"', html))):
            (need if locate(dirs, uri) else missing).append(uri)
    seen, out = set(), []
    for f in need:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out, missing


def embed_tag(dirs, rel):
    path = locate(dirs, rel)
    ext = os.path.splitext(rel)[1].lower()
    mime = MIME.get(ext, "application/octet-stream")
    attr = rel.replace("&", "&amp;").replace('"', "&quot;")
    if ext == ".json":
        # « < » n'apparaît que dans des chaînes JSON : < est équivalent et ne ferme jamais la balise
        txt = _read(path).replace("<", "\\u003c")
        return f'<script type="text/plain" data-stt-file="{attr}" data-type="{mime}">{txt}</script>\n'
    b64 = base64.b64encode(_read(path, "rb")).decode("ascii")
    return f'<script type="text/plain" data-stt-file="{attr}" data-type="{mime}" data-b64>{b64}</script>\n'


def build(viewer_dir, out=None, src=None, vendor=None, manual=True, log=log_default):
    viewer_dir = os.path.abspath(viewer_dir)
    src = src or os.path.join(viewer_dir, "index.html")
    out = out or os.path.join(viewer_dir, OUT_NAME)
    if not os.path.isfile(src):
        raise RuntimeError(f"éditeur introuvable : {src}")
    html = wrap_document(_read(src))
    if "STT_EMBED" not in html:
        raise RuntimeError("index.html antérieur à la version 11 de l'éditeur (pas de prise en charge des fichiers embarqués)")

    vdir = find_vendor(viewer_dir, vendor)
    bundle_path = sorted(glob.glob(os.path.join(vdir, "three-*-stt.min.js")))[-1]
    bundle = _read(bundle_path)
    exports = bundle_exports(bundle)
    fonts_path = os.path.join(vdir, "stt-fonts.css")
    fonts = _read(fonts_path) if os.path.isfile(fonts_path) else ""
    if not fonts:
        log("  polices non embarquées (vendor/stt-fonts.css absent) : polices système hors ligne")

    # polices : Google Fonts → @font-face embarqués
    html = re.sub(r"<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*", "", html)
    if fonts:
        style = '<style id="stt-fonts">\n' + fonts + "</style>\n"
        html = re.sub(r"</head>", lambda m: style + m.group(0), html, count=1, flags=re.I)

    # Three.js : plus d'importmap ni de CDN
    html = re.sub(r'<script type="importmap">.*?</script>\s*', "", html, flags=re.S)
    m = re.search(r'<script type="module">(.*?)</script>', html, flags=re.S)
    if not m:
        raise RuntimeError('script principal de l\'éditeur introuvable (<script type="module">)')
    module_js, used = rewrite_imports(m.group(1), exports)
    if re.search(r"https://(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)", module_js):
        raise RuntimeError("le script de l'éditeur référence encore un CDN")

    dirs = [viewer_dir] + [d for d in [os.path.dirname(os.path.abspath(src))] if d != viewer_dir]
    files, missing = collect_files(dirs, manual, html)
    if "STT_ModuleLibrary.json" in missing or "fleet.json" in missing:
        raise RuntimeError("viewer incomplet (" + ", ".join(missing) + ") : lance d'abord l'étape Viewer")
    for f in missing:
        log(f"  absent, ignoré : {f}")

    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    head = (f"<!-- Chantier naval STT · version autonome ({stamp}), générée par build_viewer_standalone.py. "
            f"Three.js r169 (MIT), polices SIL OFL 1.1. Ouvrir directement dans le navigateur : aucun serveur requis. -->\n")
    parts = [head]
    sizes = {"lib": 0, "tex": 0, "manual": 0, "data": 0}
    for rel in files:
        tag = embed_tag(dirs, rel)
        parts.append(tag)
        k = rel.split("/")[0] if "/" in rel else "data"
        sizes[k if k in sizes else "data"] += len(tag)
    parts.append("<script>\n" + LOADER_JS + "\n</script>\n")
    parts.append("<script>\n" + bundle + "\n</script>\n")
    parts.append('<script type="module">' + module_js + "</script>")
    html = html[:m.start()] + "".join(parts) + html[m.end():]

    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    os.replace(tmp, out)
    total = os.path.getsize(out)
    mb = lambda n: f"{n / 1e6:.1f} Mo"  # noqa: E731
    log(f"  {os.path.basename(out)} : {mb(total)} — bibliothèque et données {mb(sizes['data'] + sizes['lib'])}, "
        f"atlas {mb(sizes['tex'])}, manuel {mb(sizes['manual'])}, Three.js {mb(len(bundle))}, polices {mb(len(fonts))}")
    return {"out": out, "size": total, "files": len(files), "missing": missing,
            "three": os.path.basename(bundle_path), "fonts": bool(fonts), "imports": sorted(used)}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Éditeur Chantier naval STT en un seul fichier HTML, sans serveur.")
    ap.add_argument("viewer", nargs="?", default=os.path.join(HERE, "..", "viewer"),
                    help="dossier du viewer (index.html, STT_ModuleLibrary.json, lib/, tex/, fleet.json, manual/)")
    ap.add_argument("-o", "--out", help=f"fichier produit (défaut : <viewer>/{OUT_NAME})")
    ap.add_argument("--src", help="source de l'éditeur (défaut : <viewer>/index.html)")
    ap.add_argument("--vendor", help="dossier du bundle Three.js et des polices (défaut : <viewer>/vendor)")
    ap.add_argument("--no-manual", action="store_true", help="ne pas embarquer les images du manuel")
    a = ap.parse_args(argv)
    try:
        r = build(a.viewer, a.out, a.src, a.vendor, not a.no_manual)
    except RuntimeError as e:
        print(f"erreur : {e}", file=sys.stderr)
        return 1
    print(r["out"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
