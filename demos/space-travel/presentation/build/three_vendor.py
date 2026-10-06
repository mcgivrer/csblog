#!/usr/bin/env python3
"""three.js pour la présentation (lot P8) — produit vendor/three.min.js : la version publiée de three (paquet npm,
modules ES), réduite aux symboles que les modules de la présentation utilisent (THREE.X), réunie en un seul script
qui définit window.THREE (esbuild, format iife). Le jeu garde three r128 (sources/src/JS/vendor/).

  python3 build/three_vendor.py [version]     (défaut : VERSION ci-dessous ; demande npm et le réseau)

build.py compile vérifie à chaque compilation que chaque THREE.X utilisé figure dans le sous-ensemble (en-tête du
fichier) : un symbole nouveau demande de relancer ce script.
"""
import os, re, sys, json, shutil, subprocess, tempfile

VERSION = '0.186.1'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))           # presentation/
SHARED = os.path.join(ROOT, '..', 'shared')
OUT = os.path.join(ROOT, 'vendor', 'three.min.js')
EXTRA = ['REVISION', 'ColorManagement', 'ShaderChunk', 'SRGBColorSpace']   # three-compat.js et lecteur


def used_symbols():
    files = [os.path.join(ROOT, 'src', f) for f in sorted(os.listdir(os.path.join(ROOT, 'src'))) if f.endswith('.js')]
    files += [os.path.join(SHARED, f) for f in ('planets.js', 'asteroids.js', 'stars.js', 'cosmos.js')]
    names = set(EXTRA)
    for f in files:
        code = re.sub(r'/\*.*?\*/', '', open(f, encoding='utf-8').read(), flags=re.S)       # sans les commentaires
        names |= set(re.findall(r'\bTHREE\.([A-Za-z_][A-Za-z0-9_]*)', code))
    return sorted(names)


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else VERSION
    tmp = tempfile.mkdtemp(prefix='three-')
    try:
        subprocess.run(['npm', 'pack', f'three@{version}', '--silent'], cwd=tmp, check=True, stdout=subprocess.DEVNULL)
        tgz = [f for f in os.listdir(tmp) if f.endswith('.tgz')][0]
        subprocess.run(['tar', 'xzf', tgz], cwd=tmp, check=True)
        mod = os.path.join(tmp, 'package', 'build', 'three.module.js')
        exports = set()
        for f in ('three.module.js', 'three.core.js'):
            src = open(os.path.join(tmp, 'package', 'build', f), encoding='utf-8').read()
            for m in re.finditer(r'export\s*\{([^}]*)\}', src):
                exports |= {p.split(' as ')[-1].strip() for p in m.group(1).split(',') if p.strip()}
        names = used_symbols()
        absent = [n for n in names if n not in exports]
        if absent:
            sys.exit(f'three {version} : symboles absents {absent} — adapter le code (voir docs/SPEC-P8-three.md)')
        entry = os.path.join(tmp, 'entry.js')
        open(entry, 'w').write('export { ' + ', '.join(names) + " } from './package/build/three.module.js';\n")
        out = os.path.join(tmp, 'three.min.js')
        subprocess.run(['npx', '--yes', 'esbuild@0.25.12', entry, '--bundle', '--format=iife', '--global-name=THREE', '--minify',
                        '--legal-comments=inline', '--target=es2020', '--outfile=' + out], cwd=tmp, check=True)
        code = open(out, encoding='utf-8').read()
        head = f'/* three.js r{version.split(".")[1]} ({version}), sous-ensemble pour la présentation — généré par build/three_vendor.py\n' \
               f'   symboles : {",".join(names)} */\n'
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, 'w', encoding='utf-8').write(head + code)
        print(f'  {os.path.relpath(OUT, ROOT)} : three {version}, {len(names)} symboles, {len(head + code)//1024} Ko')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
