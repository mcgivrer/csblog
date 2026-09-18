#!/usr/bin/env python3
"""
minify-html-bundle.py — compacte un fichier HTML autonome (CSS et JS inline
dans un seul fichier, comme space-travel.html) : retire les commentaires,
minifie le CSS et minifie+obfusque le JS (noms de variables raccourcis),
tout en préservant le bloc de licence en tête de fichier.

Dépendances (Node.js) :
    npm install terser clean-css

Usage :
    python3 minify-html-bundle.py source.html [sortie.min.html]

Si l'argument de sortie est omis, le résultat est écrit à côté de la
source, en remplaçant l'extension par ".min.html".

Hypothèses sur la structure du fichier source (comme space-travel.html) :
  - un commentaire HTML en tout début de <head> contient la licence —
    préservé tel quel (une licence MIT, par exemple, exige explicitement
    que la notice de copyright reste incluse même dans une version
    modifiée/compactée) ;
  - un seul bloc <style>...</style> ;
  - un seul bloc <script>...</script> SANS attribut (le code du jeu/app),
    juste avant </body> — les éventuels <script src="..."> qui le
    précèdent (bibliothèques chargées depuis un CDN) sont préservés tels
    quels, une seule fois chacun.

Le script échoue explicitement (AssertionError) plutôt que d'écrire un
fichier suspect si un <script src="..."> se retrouve dupliqué dans le
résultat — bug réellement rencontré une fois (le tag était déjà présent
dans le HTML d'origine, et une version antérieure de ce script le
réinjectait une seconde fois par erreur lors du réassemblage).
"""
import re
import subprocess
import sys
import json
import shutil
from pathlib import Path


def find_node_module(name):
    """Localise un module Node installé localement (npm install <name>),
    sans dépendre d'un chemin absolu figé — contrairement à une version
    antérieure de ce script, qui pointait vers un dossier précis d'une
    machine en particulier."""
    here = Path.cwd()
    for parent in [here, *here.parents]:
        candidate = parent / 'node_modules' / name
        if candidate.exists():
            return str(parent / 'node_modules')
    return None


def minify_css(css: str) -> str:
    node_modules = find_node_module('clean-css')
    if not node_modules:
        print('! clean-css introuvable (npm install clean-css) — CSS non minifié.', file=sys.stderr)
        return css
    script = f'''
      const CleanCSS = require({json.dumps(node_modules + "/clean-css")});
      const fs = require("fs");
      const input = fs.readFileSync(process.argv[1], "utf8");
      const out = new CleanCSS({{level:2}}).minify(input);
      fs.writeFileSync(process.argv[2], out.styles);
    '''
    tmp_in, tmp_out = Path('/tmp/_mhb_in.css'), Path('/tmp/_mhb_out.css')
    tmp_in.write_text(css, encoding='utf-8')
    subprocess.run(['node', '-e', script, str(tmp_in), str(tmp_out)], check=True)
    return tmp_out.read_text(encoding='utf-8')


def minify_js(js: str) -> str:
    if not shutil.which('npx'):
        print('! npx introuvable — JS non minifié.', file=sys.stderr)
        return js
    tmp_in, tmp_out = Path('/tmp/_mhb_in.js'), Path('/tmp/_mhb_out.js')
    tmp_in.write_text(js, encoding='utf-8')
    subprocess.run(
        ['npx', 'terser', str(tmp_in), '--compress', 'drop_console=false',
         '--mangle', '--output', str(tmp_out)],
        check=True,
    )
    return tmp_out.read_text(encoding='utf-8')


def strip_html_noise(s: str) -> str:
    """Retire les commentaires HTML (hors commentaires conditionnels IE,
    par prudence) et compacte les lignes vides laissées derrière."""
    s = re.sub(r'<!--(?!\[if).*?-->', '', s, flags=re.S)
    s = re.sub(r'[ \t]+\n', '\n', s)
    s = re.sub(r'\n{2,}', '\n', s)
    return s.strip()


def build(src_path: Path, out_path: Path):
    html = src_path.read_text(encoding='utf-8')

    # ---------- 1. isole le commentaire de licence en tête, à préserver ----------
    m = re.search(r'<!--(.*?)-->', html, re.S)
    if not m:
        raise SystemExit('Aucun commentaire trouvé en tête de fichier (licence attendue) — abandon.')
    license_comment = m.group(0)
    before_comment, after_comment = html[:m.start()], html[m.end():]

    note = (
        '\n\n  Build compact/obfusqué — commentaires retirés, identifiants raccourcis.\n'
        f'  Source lisible : {src_path.name} (même dépôt de livraison).'
    )
    # insère la note juste avant la fermeture du commentaire, pas au milieu du texte de licence
    license_comment = license_comment[:-3].rstrip() + note + '\n-->'

    # ---------- 2. isole le <style> ----------
    style_m = re.search(r'<style>(.*?)</style>', after_comment, re.S)
    if not style_m:
        raise SystemExit('Aucun bloc <style> trouvé — abandon.')
    css = style_m.group(1)
    head_before_style, after_style = after_comment[:style_m.start()], after_comment[style_m.end():]

    # ---------- 3. isole le <script> principal (sans attribut), juste avant </body> ----------
    script_m = re.search(r'<script>(.*?)</script>\s*</body>', after_style, re.S)
    if not script_m:
        raise SystemExit('Aucun bloc <script> (sans attribut) trouvé avant </body> — abandon.')
    js = script_m.group(1)
    # body_before_script contient déjà, tels quels, tous les <script src="...">
    # (bibliothèques CDN) du fichier d'origine — on ne les touche pas, et
    # surtout on n'en réinjecte AUCUN nous-mêmes plus bas.
    body_before_script = after_style[:script_m.start()]
    after_script = after_style[script_m.end():]

    print(f'Avant minification : CSS={len(css)} octets, JS={len(js)} octets')
    css_min = minify_css(css)
    js_min = minify_js(js)
    print(f'Après minification  : CSS={len(css_min)} octets, JS={len(js_min)} octets')

    head_before_style = strip_html_noise(head_before_style)
    body_before_script = strip_html_noise(body_before_script)
    after_script = strip_html_noise(after_script)

    final = (
        before_comment.rstrip() + '\n' + license_comment + '\n' + head_before_style + '\n'
        + '<style>' + css_min + '</style>\n' + body_before_script + '\n'
        + '<script>' + js_min + '</script>\n</body>\n</html>\n'
    )

    # ---------- garde-fou : aucun <script src="..."> ne doit apparaître deux fois ----------
    srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', final)
    dupes = {s for s in srcs if srcs.count(s) > 1}
    assert not dupes, f'Script(s) dupliqué(s) dans le résultat, on ne livre pas : {dupes}'

    out_path.write_text(final, encoding='utf-8')
    print(f'OK : {out_path} ({len(final)} octets, {100*(1-len(final)/len(html)):.1f}% de réduction)')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix('.min.html')
    build(src, out)
