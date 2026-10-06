import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STTCOMP, make, geomReal, fleet, loadVm } from './_sttcomp.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const COMPO_DIR = path.resolve(ICI, '../../data/compositions');
const FLEET_EDITOR = path.resolve(ICI, '../../../../STT_modules/sources/fleet.json');
const G = geomReal();
const K = make({ geom: G, fleet });
const compos = fs.readdirSync(COMPO_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => [f, JSON.parse(fs.readFileSync(path.join(COMPO_DIR, f), 'utf8'))]);
const sans = (o, ...ks) => { const c = { ...o }; for (const k of ks) delete c[k]; return c; };

test('9 compositions du dépôt', () => assert.equal(compos.length, 9));
for (const [f, o] of compos) {
  test(`aller-retour importObject -> toExport : ${f}`, () => {
    const l = K.importObject(o);
    assert.equal(l.length, 1);
    const e = K.toExport(l[0]);
    assert.equal(e.id, o.id);                       // id conservé à l'import d'un stt-composition
    assert.deepEqual(sans(e, 'id', 'stats', 'game'), sans(o, 'id', 'stats', 'game'));
    /* le fichier du dépôt porte la fiche résolue (export « Pour le jeu ») : gameExport la reproduit */
    const g = K.gameExport(l[0], K.analyze(l[0]));
    assert.ok(g.data, JSON.stringify(g.error));
    assert.deepEqual(g.data.game, o.game);
    /* stats du fichier : champs entiers identiques ; length_m/size_m dépendent de la pose des pièces animées au moment de l'export
       (le fichier peut dater d'avant) : comparés à l'éditeur par le golden, pas ici */
    for (const kk of ['parts', 'mass', 'containers', 'passengers', 'tank_m3']) assert.equal(g.data.stats[kk], o.stats[kk], `${f} stats.${kk}`);
    /* second tour : stable */
    assert.deepEqual(K.toExport(K.importObject(e)[0]), e);
  });
}
test('toExport : stats et marques personnalisées sur demande, sans analysis par défaut', () => {
  const c = K.importObject(compos[0][1])[0];
  assert.equal('stats' in K.toExport(c), false);
  assert.deepEqual(K.toExport(c, { stats: { parts: 1 } }).stats, { parts: 1 });
  const d = { name: 'Zed', mark: 'ZED', tagline: 'Z', registry: 'ZED-1', livery_hex: '#112233', emblem: 'chevrons', _v: 3 };
  c.company = 'ZED';
  const e = K.toExport(c, { companies: { ZED: d, AUTRE: d } });
  assert.deepEqual(Object.keys(e.companies), ['ZED']);
  assert.equal('_v' in e.companies.ZED, false);
  assert.equal(e.registry, 'ZED-1');
});
test('core.toExport branché sur gameExport', () => {
  const c = K.importObject(compos.find(([f]) => /meridian/.test(f))[1])[0];
  const a = K.analyze(c), r = K.gameExport(c, a);
  assert.ok(r.data && !r.error, JSON.stringify(r.error));
  assert.equal(r.data.format, 'stt-composition'); assert.deepEqual(r.data.stats, a.stats);
  assert.equal(r.data.game.class, 'ship');
});

const F = JSON.parse(fs.readFileSync(FLEET_EDITOR, 'utf8'));
test('flotte : vaisseaux au format fleet.json', () => {
  assert.ok(F.ships.length >= 5);
  for (const s of F.ships) {
    const c = K.fromShip(s);
    assert.equal(c.type, 'ship'); assert.equal(c.parts.length, s.modules.length, s.name);
    assert.equal(c.parts[0].parent, null);
    assert.deepEqual(c.parts.map((p) => p.key), s.modules);
    assert.equal(c.name, s.name); assert.equal(K.analyze(c).issues.some((i) => i.sev === 'err'), false, s.name);
    assert.deepEqual(K.importObject(s).map((x) => x.name), [s.name]);
  }
});
test('flotte : stations au format fleet.json', () => {
  assert.ok(F.stations.length >= 3);
  for (const s of F.stations) {
    const c = K.fromStation(s);
    assert.equal(c.type, 'station'); assert.equal(c.parts.length, s.parts.length + (s.shuttles || []).length, s.name);
    assert.equal(c.docking_ports.length, (s.docking_ports || []).length);
    assert.equal(K.importObject(s)[0].parts.length, c.parts.length);
    const e = K.toExport(c);
    assert.equal(K.importObject(e)[0].parts.length, c.parts.length);
  }
});
test('flotte entière et enveloppes : ships, stations, compositions', () => {
  assert.equal(K.importObject(F).length, F.ships.length + F.stations.length);
  assert.equal(K.importObject({ compositions: compos.map(([, o]) => o) }).length, 9);
  assert.equal(K.importObject(compos.map(([, o]) => o)).length, 9);
});
test('cas d\'erreur : entrées inconnues ou vides', () => {
  for (const x of [null, undefined, 42, 'x', {}, [], { format: 'stt-composition' }, { ships: [] }, { modules: [] }, { modules: ['NOPE'] }, { parts: [], links: [] }, { parts: [['a', 'NOPE']], links: [] }])
    assert.deepEqual(K.importObject(x), [], JSON.stringify(x));
});
test('cas d\'erreur : liens invalides, marque et zone inconnues, ports hors module', () => {
  const o = { format: 'stt-composition', id: 'x', name: 'T', company: 'INCONNU', registry: 'abc-1', root: 'absent',
    parts: [['a', 'CMD'], ['b', 'PWR', { zone: 'zzz', company: 'nope', door: 'field' }], ['c', 'PROP'], ['a', 'PAX'], ['d', 'BAY']],
    links: [['a.AFT', 'b.FWD', 370], ['b.AFT', 'c.NOPE', 0], ['z.AFT', 'c.FWD', 0], ['b.AFT', 'c.FWD', 0], 'bad', ['a.AFT']] };
  const [c] = K.importObject(o);
  assert.equal(c.company, 'STT'); assert.equal(c.registry, 'ABC-1');
  assert.deepEqual(c.parts.map((p) => p.id), ['a', 'b', 'c']);       // racine absente -> 1re pièce ; doublon et orpheline ignorés
  const b = c.parts[1];
  assert.equal(b.roll, 10); assert.equal(b.zone, null); assert.equal(b.company, null); assert.equal(b.door, 'field');
  assert.equal(c.parts[0].parent, null); assert.equal(c.parts[2].parent, 'b');
});
test('conteneurs : marques inconnues -> null ; liens extra sans port déjà pris', () => {
  const o = { format: 'stt-composition', parts: [['cmd', 'CMD'], ['cg', 'CARGO']], links: [['cmd.AFT', 'cg.FWD', 0], ['cmd.AFT', 'cg.AFT', 0]], containers: { cg: ['VESTA', 'XXX'] } };
  const [c] = K.importObject(o);
  assert.deepEqual(c.parts[1].containers.slice(0, 2), ['VESTA', null]);
  assert.equal(c.parts[1].containers.length, K.containerMats('CARGO').length);
  assert.deepEqual(c.extra_links, []);
  assert.equal(c.parts[0].containers, null);
});
test('mergeCompanies / knownCompany / companyOf injectés par l\'environnement', () => {
  let recu = null;
  const custom = { ZED: { registry: 'ZED-9' } };
  const k = make({ geom: G, fleet, mergeCompanies: (x) => { recu = x; }, knownCompany: (n) => !!(fleet.companies[n] || custom[n]), companyOf: (n) => custom[n] });
  const [c] = k.importObject({ format: 'stt-composition', company: 'ZED', registry: 'zed-9', companies: { ZED: { name: 'Zed' } }, parts: [['cmd', 'CMD']], links: [] });
  assert.deepEqual(recu, { ZED: { name: 'Zed' } });
  assert.equal(c.company, 'ZED'); assert.equal(c.registry, '');   // registre = celui de la marque : non stocké
  assert.equal(k.toExport(c).registry, 'ZED-9');
});
test('chargement par vm : mêmes résultats que require', () => {
  const { STTCOMP: V } = loadVm();
  const kv = V.create({ geom: G, fleet, uid: () => 'u' });
  const o = compos[0][1];
  assert.deepEqual(JSON.parse(JSON.stringify(kv.toExport(kv.importObject(o)[0]))), JSON.parse(JSON.stringify(K.toExport(K.importObject(o)[0]))));
});
