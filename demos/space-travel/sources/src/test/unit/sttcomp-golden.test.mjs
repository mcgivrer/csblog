/* Parité noyau STTCOMP <-> éditeur : le golden (fixtures/sttcomp-golden.json) est produit par la sonde de l'éditeur (?probe, L2a.3)
   sur 17 sources (9 compositions du dépôt + 5 vaisseaux + 3 stations de fleet.json). Le noyau, nourri de modules-geom.json + la flotte,
   doit donner les mêmes exports, ports libres, matrices du monde (1e-6) et issues d'analyse. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { make, geomReal, fleet } from './_sttcomp.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(ICI, p), 'utf8'));
const GOLD = read('fixtures/sttcomp-golden.json');
const F = read('../../../../STT_modules/sources/fleet.json');
const G = geomReal();
const K = make({ geom: G, fleet });
const COMPO = (n) => read(`../../data/compositions/${n}.json`);

/* Table de rendu code + args -> texte : reproduit mot pour mot les textes de l'éditeur (index.html, analyze) ;
   c'est la future table ISSUE_FR de l'éditeur (L2a.6). */
const ISSUE_FR = {
  empty: () => 'Composition vide : glisse un module depuis la barre du bas.',
  station_prop: (a) => `Une station ne peut pas avoir de propulsion : retire ${a.id}.`,
  no_prop: () => 'Aucune propulsion : ajoute un module PROP en poupe.',
  multi_prop: (a) => `${a.n} modules de propulsion : un seul est prévu par vaisseau.`,
  no_cmd: () => 'Pas de module de commandement (CMD).',
  jet_hit: (a) => `Le jet du propulseur ${a.id} frappe ${a.hit}.`,
  thrust_offset: (a) => `Poussée décentrée de ${a.off.toFixed(1)} m par rapport au centre de masse : le vaisseau tournera sur lui-même.`,
  no_pwr: () => 'Pas de module d’énergie (PWR).',
  overlap: (a) => `Chevauchement entre ${a.a} et ${a.b}.`,
  overlap_more: (a) => `… et ${a.n} autres chevauchements.`,
  no_dock: () => 'Aucun port d’amarrage déclaré : clique un anneau libre pour en créer un.',
  valid_ship: () => 'Vaisseau valide : prêt à l’export.',
  valid_station: () => 'Station valide : prête à l’export.',
};
const render = (i) => ({ sev: i.sev, msg: ISSUE_FR[i.code](i.args), ids: i.ids || [] });

/* source du golden -> composition importée par le noyau */
function source(key) {
  const [kind, idx] = key.split(':');
  if (kind === 'composition') return COMPO(idx);
  if (kind === 'ship') return F.ships[+idx];
  return F.stations[+idx];
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what} : ${a} vs ${b} (tol ${tol})`);
const nearArr = (a, b, tol, what) => { assert.equal(a.length, b.length, what); a.forEach((x, i) => near(x, b[i], tol, `${what}[${i}]`)); };

test('golden : 17 sources', () => assert.equal(Object.keys(GOLD.compositions).length, 17));
test('golden : la flotte de l\'éditeur est celle des tests (indices des sources)', () => {
  assert.deepEqual(F.ships.map((s) => s.name), Object.keys(GOLD.compositions).filter((k) => k.startsWith('ship:')).map((k) => k.split(':')[2]));
  assert.deepEqual(F.stations.map((s) => s.name), Object.keys(GOLD.compositions).filter((k) => k.startsWith('station:')).map((k) => k.split(':')[2]));
});

for (const [key, list] of Object.entries(GOLD.compositions)) {
  test(`golden : ${key}`, () => {
    const imported = K.importObject(source(key));
    assert.equal(imported.length, list.length);
    list.forEach((g, n) => {
      const c = imported[n];
      /* export identique (ids exclus) */
      const e = K.toExport(c);
      const ge = { ...g.export }, ee = { ...e };
      delete ge.id; delete ee.id;   // le golden exclut les ids (aléatoires pour la flotte)
      assert.deepEqual(ee, ge, 'export');
      /* ports libres */
      assert.deepEqual(K.freePorts(c).map(({ id, key: k, kind, port }) => ({ id, key: k, kind, port })), g.freePorts, 'freePorts');
      /* monde */
      const W = K.world(c);
      assert.deepEqual([...W.keys()].sort(), Object.keys(g.world).sort(), 'ids du monde');
      /* rotations/échelles à 1e-6 ; translations à 1e-5 : la geom du JSON est arrondie à 6 décimales (m) et l'éditeur compose en
         flottants issus de float32 (glTF) ; l'écart cumulé le long d'une chaîne de ~10 modules atteint ~4e-6 m (mesuré), sans signification */
      for (const [id, M] of W) { const m = Array.from(M), r = g.world[id]; nearArr(m.slice(0, 12), r.slice(0, 12), 1e-6, `world.${id}.R`); nearArr(m.slice(12), r.slice(12), 1e-5, `world.${id}.T`); }
      /* analyse */
      const a = K.analyze(c, W), ga = g.analyze;
      assert.deepEqual(a.issues.map(render), ga.issues.map((i) => ({ sev: i.sev, msg: i.msg, ids: i.ids || [] })), 'issues');
      assert.deepEqual(a.pairs.map((p) => [...p].sort()).sort(), (ga.pairs || []).map((p) => [...p].sort()).sort(), 'pairs');
      assert.deepEqual([...a.colliding].sort(), [...(ga.colliding || [])].sort(), 'colliding');
      for (const kk of ['parts', 'mass', 'containers', 'passengers', 'tank_m3']) assert.equal(a.stats[kk], ga.stats[kk], `stats.${kk}`);
      near(a.stats.length_m, ga.stats.length_m, 0.1 + 1e-9, 'stats.length_m');
      nearArr(a.stats.size_m, ga.stats.size_m, 0.1 + 1e-9, 'stats.size_m');
      nearArr(Array.from(a.com), ga.com, 1e-3, 'com');
      nearArr(a.aabb[0] ? a.aabb.flat() : a.aabb, ga.aabb.flat(), 1e-2, 'aabb');
    });
  });
}

test('golden : containerMats du noyau = golden', () => {
  assert.deepEqual(Object.keys(GOLD.containerMats).sort(), Object.keys(G.modules).filter((k) => K.containerMats(k).length || GOLD.containerMats[k]).sort());
  for (const [key, list] of Object.entries(GOLD.containerMats)) {
    const mine = K.containerMats(key);
    assert.equal(mine.length, list.length, key);
    list.forEach((g, i) => { assert.equal(mine[i].slot, g.slot); nearArr(Array.from(mine[i].M), g.M, 1e-5, `${key}.${g.slot}.M`); nearArr(mine[i].dir, g.dir, 1e-5, `${key}.${g.slot}.dir`); });
  }
});
test('golden : geom du noyau (modules-geom.json) proche de la geom des prototypes de l\'éditeur', () => {
  assert.deepEqual(Object.keys(G.modules).sort(), Object.keys(GOLD.geom.modules).sort());
  for (const [key, g] of Object.entries(GOLD.geom.modules)) {
    const m = G.modules[key];
    assert.deepEqual(m.ports, g.ports, key); near(m.mass_t, g.mass_t, 1e-9, `${key}.mass`); near(m.length_m, g.length_m, 1e-9, `${key}.len`);
    for (const p of g.ports) nearArr(m.sockets[p], g.sockets[p], 1e-4, `${key}.socket.${p}`);
    nearArr(m.hull, g.hull, 1e-4, `${key}.hull`); nearArr(m.full || m.hull, g.full, 1e-4, `${key}.full`);
    if (g.exhaust) nearArr(m.exhaust, g.exhaust, 1e-4, `${key}.exhaust`);
  }
  nearArr(G.container.hull, GOLD.geom.container.hull, 1e-4, 'container.hull');
});
