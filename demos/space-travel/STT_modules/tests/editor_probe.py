#!/usr/bin/env python3
"""Sonde de non-régression de l'éditeur (?probe) : produit ou vérifie sources/src/test/unit/fixtures/sttcomp-golden.json.
Usage : python3 STT_modules/tests/editor_probe.py [--check]   (réseau requis : three r169 par CDN)"""
import glob, json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GOLDEN = os.path.join(ROOT, 'sources/src/test/unit/fixtures/sttcomp-golden.json')
PAGE = '/STT_modules/sources/index.html'
TOL = 1.0001e-6

JS = """(srcs) => {
  const P = window.__sttProbe, r = (v) => (typeof v === 'number' ? v : v);
  const out = {};
  for (const [name, o] of srcs) {
    const list = P.importObject(o), recs = [];
    for (const c of list) {
      const ex = P.toExport(c); delete ex.id;
      const rec = { export: ex };
      P.withComp(c, (cc, W) => {
        const a = P.analyze();
        rec.analyze = { issues: a.issues, colliding: [...a.colliding].sort(), pairs: a.pairs, stats: a.stats,
          aabb: [a.aabb.min.toArray(), a.aabb.max.toArray()], com: a.com.toArray() };
        rec.freePorts = P.freePortsList();
        rec.world = {}; for (const [id, M] of W) rec.world[id] = M.elements.slice();
      });
      recs.push(rec);
    }
    out[name] = recs;
  }
  const geom = P.geomFromProtos(), cm = {};
  for (const k of Object.keys(geom.modules)) cm[k] = P.containerMats(k).map((x) => ({ slot: x.slot, M: x.M.elements.slice(), dir: x.dir.toArray() }));
  return { compositions: out, geom, containerMats: cm };
}"""


def norm(v):
    if isinstance(v, float):
        v = round(v, 6)
        return 0.0 if v == 0 else v
    if isinstance(v, list):
        return [norm(x) for x in v]
    if isinstance(v, dict):
        return {k: norm(x) for k, x in v.items()}
    return v


def sources():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'sources/src/data/compositions/*.json'))):
        out.append(('composition:' + os.path.basename(f)[:-5], json.load(open(f, encoding='utf-8'))))
    fleet = json.load(open(os.path.join(ROOT, 'STT_modules/sources/fleet.json'), encoding='utf-8'))
    for i, s in enumerate(fleet['ships']):
        out.append((f"ship:{i}:{s.get('name')}", s))
    for i, s in enumerate(fleet['stations']):
        out.append((f"station:{i}:{s.get('name')}", s))
    return out


def run():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        errs = []
        with sync_playwright() as pw:
            br = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            base = f'http://127.0.0.1:{port}{PAGE}'
            # sans ?probe : aucune sonde, aucune erreur
            pg = br.new_page(); e0 = []
            pg.on('console', lambda m: e0.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: e0.append(str(e)))
            pg.goto(base); pg.wait_for_function("document.getElementById('loading').hidden", timeout=180000)
            if pg.evaluate('window.__sttProbe') is not None: errs.append('__sttProbe défini sans ?probe')
            errs += ['sans ?probe : ' + e for e in e0]; pg.close()
            pg = br.new_page(); e1 = []
            pg.on('console', lambda m: e1.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: e1.append(str(e)))
            pg.goto(base + '?probe')
            pg.wait_for_function("window.__sttProbe && document.getElementById('loading').hidden", timeout=180000)
            res = pg.evaluate(JS, sources())
            errs += ['avec ?probe : ' + e for e in e1]
            br.close()
        if errs:
            sys.exit('Erreurs console :\n' + '\n'.join(errs))
        return norm(res)
    finally:
        srv.terminate(); srv.wait()


def diff(a, b, path=''):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b: yield f'{path}/{k} : clé absente'
            else: yield from diff(a[k], b[k], f'{path}/{k}')
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): yield f'{path} : longueurs {len(a)} != {len(b)}'
        else:
            for i, (x, y) in enumerate(zip(a, b)): yield from diff(x, y, f'{path}/{i}')
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        if abs(a - b) > TOL: yield f'{path} : {a} != {b}'
    elif a != b:
        yield f'{path} : {a!r} != {b!r}'


def main():
    res = run()
    if '--check' in sys.argv:
        gold = json.load(open(GOLDEN, encoding='utf-8'))
        d = list(diff(gold, res))
        print('\n'.join(d[:30]) or 'OK : éditeur conforme au golden')
        sys.exit(1 if d else 0)
    os.makedirs(os.path.dirname(GOLDEN), exist_ok=True)
    with open(GOLDEN, 'w', encoding='utf-8') as f:
        json.dump(res, f, sort_keys=True, ensure_ascii=False, separators=(',', ':')); f.write('\n')
    print('écrit', GOLDEN, os.path.getsize(GOLDEN), 'octets,', len(res['compositions']), 'sources')


if __name__ == '__main__':
    main()
