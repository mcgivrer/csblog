#!/usr/bin/env python3
"""
spec-pack.py — assemble les deux formes d'une spécification Markdown de
space-travel (docs/spec-space_travel_and_transport-X.Y[_en].md et .zip).

Une spécification se TRAVAILLE sous sa forme légère : un seul fichier .md dont
les images sont des fichiers relatifs (images/img-001.jpg…), plus le dossier
images/. Ce script en tire les deux formes livrées :
  - le .md AUTONOME, images intégrées en base64 : un seul fichier, aucun
    dossier annexe requis ;
  - le .zip : le .md léger et son dossier images/ (toutes les images du
    dossier, référencées ou non).

Usage :
  python3 spec-pack.py pack DOSSIER [--out SORTIE]
      DOSSIER contient un seul .md et un dossier images/ ; écrit NOM.md et
      NOM.zip dans SORTIE (défaut : le dossier courant).
  python3 spec-pack.py unpack FICHIER.zip DOSSIER
      extrait une spécification pour la retravailler.

Refait les captures d'écran avec screenshots.sh, copie-les sous les noms
attendus dans DOSSIER/images/, puis relance « pack ».
"""
import base64
import re
import sys
import zipfile
from pathlib import Path

MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp'}
REF = re.compile(r'\((images/[^)\s]+)\)')


def pack(folder, out):
    folder, out = Path(folder), Path(out)
    mds = sorted(folder.glob('*.md'))
    if len(mds) != 1:
        sys.exit('Le dossier doit contenir un seul fichier .md (trouvé : %d).' % len(mds))
    md = mds[0]
    light = md.read_text(encoding='utf-8')

    refs = sorted(set(REF.findall(light)))
    missing = [r for r in refs if not (folder / r).is_file()]
    if missing:
        sys.exit('Images référencées mais absentes : ' + ', '.join(missing))

    def inline(m):
        path = folder / m.group(1)
        mime = MIME.get(path.suffix.lower())
        if not mime:
            sys.exit('Type d\'image inconnu : %s' % path)
        return '(data:%s;base64,%s)' % (mime, base64.b64encode(path.read_bytes()).decode('ascii'))

    out.mkdir(parents=True, exist_ok=True)
    (out / md.name).write_text(REF.sub(inline, light), encoding='utf-8')

    images = sorted(p for p in (folder / 'images').iterdir() if p.is_file())
    zpath = out / (md.stem + '.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(md, md.name)
        for p in images:
            z.write(p, 'images/' + p.name)

    orphans = [p.name for p in images if 'images/' + p.name not in refs]
    print('%s : %d images référencées, %d au total' % (md.name, len(refs), len(images)))
    print('  %s (%.1f Mo)' % (out / md.name, (out / md.name).stat().st_size / 1e6))
    print('  %s (%.1f Mo)' % (zpath, zpath.stat().st_size / 1e6))
    if orphans:
        print('  images non référencées (gardées dans le zip) : ' + ', '.join(orphans))


def unpack(zpath, folder):
    with zipfile.ZipFile(zpath) as z:
        z.extractall(folder)
    print('extrait dans', folder)


def main(argv):
    if len(argv) >= 3 and argv[1] == 'pack':
        out = '.'
        if '--out' in argv:
            out = argv[argv.index('--out') + 1]
        pack(argv[2], out)
    elif len(argv) == 4 and argv[1] == 'unpack':
        unpack(argv[2], argv[3])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv)
