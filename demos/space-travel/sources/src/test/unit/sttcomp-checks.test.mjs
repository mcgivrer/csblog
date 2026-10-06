import test from 'node:test';
import assert from 'node:assert/strict';
import { STTCOMP, make, geomReal, loadVm } from './_sttcomp.mjs';

const { m4 } = STTCOMP;
const G = geomReal();
const K = make({ geom: G });
const codes = (a) => a.issues.map((i) => i.code);
const has = (a, code) => assert.ok(codes(a).includes(code), `${code} attendu, reçu ${codes(a)}`);
const add = (k, c, key, parent, pport) => k.addPart(c, key, parent ? { id: parent, port: pport } : null, parent ? k.defaultChildPort(key, c.parts.find((p) => p.id === parent).key, pport) : undefined).part;
/* CMD -AFT-> PWR -AFT-> PROP */
function ship(k = K, o = {}) {
  const c = k.blank('ship');
  const cmd = o.noCmd ? add(k, c, 'PWR') : add(k, c, 'CMD');
  const pwr = o.noCmd ? cmd : add(k, c, 'PWR', cmd.id, 'AFT');
  if (!o.noPwr || o.noCmd) { /* PWR déjà posé */ }
  if (!o.noProp) add(k, c, 'PROP', pwr.id, 'AFT');
  return c;
}
const box = (c, h) => [c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]];
const T = m4.translation;

test('obb : centre, axes, demi-longueurs, rétrécissement et échelle', () => {
  const o = STTCOMP.create({ geom: G }).obb(T(10, 0, 0), [-1, -2, -3, 1, 2, 3], 0.5);
  assert.deepEqual(o.c, [10, 0, 0]);
  assert.deepEqual(o.u, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual(o.e, [0.5, 1.5, 2.5]);
  const R = m4.mul(T(0, 0, 0), m4.rotY(Math.PI / 2));
  const r = K.obb(R, [-1, -1, -3, 1, 1, 3]);
  assert.ok(Math.abs(r.u[0][2] + 1) < 1e-12 && Math.abs(r.u[2][0] - 1) < 1e-12);   // rotY(+90) : X -> -Z, Z -> X
  const s = Float64Array.from(m4.identity()); s[0] = s[5] = s[10] = 2;
  assert.deepEqual(K.obb(s, [-1, -1, -1, 1, 1, 1]).e, [2, 2, 2]);
  assert.deepEqual(K.obb(m4.identity(), [0, 0, 0, 0, 0, 0], 1).e, [0.05, 0.05, 0.05]);   // plancher
});
test('obbCorners : 8 coins', () => {
  const o = K.obb(T(1, 2, 3), [-1, -1, -1, 1, 1, 1]), out = K.obbCorners(o, []);
  assert.equal(out.length, 8);
  assert.deepEqual(out[0], [0, 1, 2]); assert.deepEqual(out[7], [2, 3, 4]);
});
test('obbOverlap : recouvrant, séparé, touchant, tourné', () => {
  const b = [-1, -1, -1, 1, 1, 1], A = K.obb(m4.identity(), b);
  assert.equal(K.obbOverlap(A, K.obb(T(1, 0, 0), b)), true);
  assert.equal(K.obbOverlap(A, K.obb(T(3, 0, 0), b)), false);
  assert.equal(K.obbOverlap(A, K.obb(T(2, 0, 0), b)), true);       // face contre face : tolérance 1e-6 des axes, bord inclus
  assert.equal(K.obbOverlap(A, K.obb(T(2.001, 0, 0), b)), false);
  const R = m4.mul(T(2.3, 0, 0), m4.rotY(Math.PI / 4));            // cube tourné de 45° : pointe à 1.414 du centre
  assert.equal(K.obbOverlap(A, K.obb(R, b)), true);
  assert.equal(K.obbOverlap(A, K.obb(m4.mul(T(2.5, 0, 0), m4.rotY(Math.PI / 4)), b)), false);
  assert.equal(K.obbOverlap(K.obb(T(0, 0, 5), b), A), false);      // symétrie
  assert.equal(K.anyOverlap([A, K.obb(T(9, 0, 0), b)], [K.obb(T(9.5, 0, 0), b)]), true);
});
test('rayOBB : touche, manque, derrière, dedans', () => {
  const B = K.obb(T(0, 0, 10), [-1, -1, -1, 1, 1, 1]);
  assert.ok(Math.abs(K.rayOBB([0, 0, 0], [0, 0, 1], B) - 9) < 1e-9);
  assert.equal(K.rayOBB([0, 0, 0], [0, 1, 0], B), null);           // parallèle hors boîte
  assert.equal(K.rayOBB([5, 0, 0], [0, 0, 1], B), null);
  assert.equal(K.rayOBB([0, 0, 0], [0, 0, -1], B), null);         // derrière
  assert.ok(Math.abs(K.rayOBB([0, 0, 10], [0, 0, 1], B) - 1) < 1e-9);   // origine dedans : sortie
});
test('hullBox / fullBox / partOBBs : géométrie réelle, conteneurs', () => {
  assert.deepEqual(K.hullBox('PROP'), G.modules.PROP.hull);
  assert.deepEqual(K.fullBox('PROP'), G.modules.PROP.full);
  assert.deepEqual(K.hullBox('__CONTAINER__'), G.container.hull);
  assert.deepEqual(K.hullBox('INCONNU'), [0, 0, 0, 0, 0, 0]);
  const c = K.blank('ship'), cg = add(K, c, 'CARGO');
  cg.containers = K.containerMats('CARGO').map((_, i) => (i === 0 ? 'ACME' : null));
  assert.equal(K.partOBBs(c, cg, m4.identity()).length, 2);       // coque + 1 conteneur
  cg.containers = null;
  assert.equal(K.partOBBs(c, cg, m4.identity()).length, 1);
});
test('analyze : composition vide', () => {
  const a = K.analyze(K.blank('ship'));
  assert.deepEqual(a.issues, [{ sev: 'info', code: 'empty', args: {}, ids: [] }]);
  assert.deepEqual(a.stats, { parts: 0, mass: 0, containers: 0, passengers: 0, tank_m3: 0, length_m: 0, size_m: [0, 0, 0] });
  assert.deepEqual(a.aabb, [0, 0, 0, 0, 0, 0]); assert.deepEqual(a.com, [0, 0, 0]);
});
test('analyze : vaisseau valide, stats, centre de masse, boîte', () => {
  const c = ship(), a = K.analyze(c);
  assert.deepEqual(a.issues, [{ sev: 'ok', code: 'valid_ship', args: {}, ids: [] }]);
  assert.equal(a.stats.parts, 3); assert.equal(a.stats.containers, 0);
  const mass = ['CMD', 'PWR', 'PROP'].reduce((s, k) => s + K.massOf(k), 0);
  assert.equal(a.stats.mass, Math.round(mass));
  assert.ok(a.stats.length_m > 40 && a.stats.length_m < 70);
  assert.equal(a.stats.size_m.length, 3);
  assert.equal(a.aabb.length, 6); assert.ok(a.aabb[3] > a.aabb[0] && a.aabb[5] > a.aabb[2]);
  assert.ok(Math.abs(a.stats.size_m[2] - (a.aabb[5] - a.aabb[2])) < 0.06);
  assert.equal(a.obbs.size, 3); assert.equal(a.colliding.size, 0); assert.deepEqual(a.pairs, []);
  assert.ok(Math.abs(a.com[0]) < 1e-6);
  assert.deepEqual(K.analyze(c, K.world(c)).stats, a.stats);      // W explicite
});
test('analyze : chaque règle de bord', () => {
  has(K.analyze(ship(K, { noProp: true })), 'no_prop');
  const mp = ship(); add(K, mp, 'PROP', 'cmd1', 'FWD');
  const am = K.analyze(mp); has(am, 'multi_prop');
  assert.deepEqual(am.issues.find((i) => i.code === 'multi_prop').args, { n: 2 });
  const nc = K.analyze(ship(K, { noCmd: true })); has(nc, 'no_cmd');
  const c = K.blank('ship'), cmd = add(K, c, 'CMD'); add(K, c, 'PROP', cmd.id, 'AFT');
  has(K.analyze(c), 'no_pwr');
  assert.ok(!codes(K.analyze(c)).includes('valid_ship'));
  /* poussée décentrée : PROP latéral sur un NODE4 */
  const t = K.blank('ship'), n = add(K, t, 'NODE4'); add(K, t, 'PROP', n.id, 'PORT'); add(K, t, 'CMD', n.id, 'AFT');
  const at = K.analyze(t); has(at, 'thrust_offset');
  const to = at.issues.find((i) => i.code === 'thrust_offset');
  assert.equal(to.sev, 'warn'); assert.equal(to.args.id, 'prop1'); assert.ok(to.args.off > 2.5);
  /* chevauchement : PROP monté à l'arrière d'un NODE4 sur lequel un PWR est déjà fixé */
  const o = K.blank('ship'), n4 = add(K, o, 'NODE4'); add(K, o, 'PROP', n4.id, 'AFT'); add(K, o, 'CMD', n4.id, 'FWD'); add(K, o, 'PWR', 'cmd1', 'AFT');
  const ao = K.analyze(o); has(ao, 'overlap');
  const ov = ao.issues.find((i) => i.code === 'overlap');
  assert.equal(ov.sev, 'warn'); assert.deepEqual(ov.ids, [ov.args.a, ov.args.b]);
  assert.ok(ao.colliding.has(ov.args.a) && ao.pairs.length >= 1);
  assert.ok(!codes(ao).includes('valid_ship'));
});
test('analyze : jet_hit et overlap_more avec un monde explicite', () => {
  const c = K.blank('ship');
  c.parts.push({ id: 'prop1', key: 'PROP', parent: null, containers: null }, { id: 'cmd1', key: 'CMD', parent: null, containers: null });
  const hit = K.analyze(c, new Map([['prop1', m4.identity()], ['cmd1', T(0, 0, -60)]]));
  const j = hit.issues.find((i) => i.code === 'jet_hit');
  assert.ok(j, codes(hit)); assert.equal(j.sev, 'err'); assert.deepEqual(j.args, { id: 'prop1', hit: 'cmd1' }); assert.deepEqual(j.ids, ['prop1', 'cmd1']);
  const away = K.analyze(c, new Map([['prop1', m4.identity()], ['cmd1', T(0, 0, 60)]]));
  assert.ok(!codes(away).includes('jet_hit'));
  const s = K.blank('ship'), W = new Map();
  for (let i = 1; i <= 5; i++) { s.parts.push({ id: 'cmd' + i, key: 'CMD', parent: null, containers: null }); W.set('cmd' + i, m4.identity()); }
  const as = K.analyze(s, W);
  assert.equal(as.pairs.length, 10);
  assert.equal(as.issues.filter((i) => i.code === 'overlap').length, 8);
  assert.deepEqual(as.issues.find((i) => i.code === 'overlap_more').args, { n: 2 });
});
test('analyze : stations (station_prop, no_dock, valid_station)', () => {
  const c = K.blank('station'), cmd = add(K, c, 'CMD'); add(K, c, 'PWR', cmd.id, 'AFT');
  const a = K.analyze(c); assert.deepEqual(codes(a), ['valid_station', 'no_dock']);
  c.docking_ports = ['cmd1.FWD'];
  assert.deepEqual(K.analyze(c).issues, [{ sev: 'ok', code: 'valid_station', args: {}, ids: [] }]);
  assert.deepEqual(K.addPart(c, 'PROP', { id: 'pwr1', port: 'AFT' }, 'FWD'), { ok: false, code: 'station_prop' });
  c.parts.push({ id: 'prop1', key: 'PROP', parent: 'pwr1', pport: 'AFT', port: 'FWD', roll: 0, containers: null });
  const ap = K.analyze(c), e = ap.issues.find((i) => i.code === 'station_prop');
  assert.deepEqual(e, { sev: 'err', code: 'station_prop', args: { id: 'prop1' }, ids: ['prop1'] });
  assert.ok(!codes(ap).some((x) => x.startsWith('valid')));
});
test('stats : conteneurs, passagers, réservoirs', () => {
  const c = K.blank('ship'), cmd = add(K, c, 'CMD'), cg = add(K, c, 'CARGO', cmd.id, 'AFT');
  cg.containers = K.containerMats('CARGO').map(() => 'ACME');
  const n = cg.containers.length, a = K.analyze(c);
  assert.equal(a.stats.containers, n);
  assert.equal(a.stats.mass, Math.round(K.massOf('CMD') + K.massOf('CARGO') + 6.5 * n));
  const p = K.blank('ship'), c0 = add(K, p, 'CMD'), px = add(K, p, 'PAX', c0.id, 'AFT'); add(K, p, 'TANK', px.id, 'AFT');
  const ap = K.analyze(p); assert.equal(ap.stats.passengers, 48); assert.equal(ap.stats.tank_m3, 840);
});
test('autoGame / cleanGame / resolvedGame', () => {
  const st = (o) => Object.assign({ parts: 6, mass: 500, containers: 0, passengers: 0, tank_m3: 0 }, o);
  assert.deepEqual(K.autoGame(st({})), { tier: 'I', family: 'independant', ftl: false, crew: 2 });
  assert.equal(K.autoGame(st({ mass: 800 })).tier, 'II'); assert.equal(K.autoGame(st({ mass: 1300 })).tier, 'III');
  assert.deepEqual(K.autoGame(st({ mass: 2000 })), { tier: 'IV', family: 'independant', ftl: true, crew: 10 });
  assert.equal(K.autoGame(st({ containers: 4 })).family, 'fret'); assert.equal(K.autoGame(st({ passengers: 48 })).family, 'passagers');
  assert.equal(K.autoGame(st({ tank_m3: 1680 })).family, 'vrac'); assert.equal(K.autoGame(st({ parts: 4 })).family, 'pousseur');
  assert.deepEqual(Object.keys(K.FAMILIES), ['fret', 'passagers', 'vrac', 'independant', 'pousseur']);
  assert.equal(K.ARCH_AUTO.fret, 'Cargo modulaire'); assert.deepEqual(K.CREW, { I: 2, II: 4, III: 6, IV: 10 });
  assert.equal(STTCOMP.autoGame, K.autoGame);
  const c = { docking_ports: ['a.FWD', 'b.FWD'] };
  assert.deepEqual(K.cleanGame(null, c), {});
  assert.deepEqual(K.cleanGame({ family: 'x', tier: 'V', ftl: 1, crew: 0, arch: '  ', description: '' }, c), {});
  assert.deepEqual(K.cleanGame({ family: 'vrac', tier: 'II', ftl: true, crew: 99.4, arch: ' ' + 'x'.repeat(50), description: 'd'.repeat(500),
    berths: [{ port: 'a.FWD', cls: 'L' }, { port: 'z.FWD', cls: 'L' }, { port: 'b.FWD', cls: 'Q' }, null] }, c),
    { family: 'vrac', tier: 'II', ftl: true, crew: 60, arch: 'x'.repeat(40), description: 'd'.repeat(400), berths: [{ port: 'a.FWD', cls: 'L' }] });
  const sh = ship(), s = K.analyze(sh).stats;
  assert.deepEqual(K.resolvedGame(sh, s), { version: 1, class: 'ship', family: 'pousseur', tier: 'I', ftl: false, crew: 2, arch: 'Pousseur modulaire', description: '' });
  sh.game = { family: 'fret', tier: 'III', crew: 7, description: 'Test' };
  assert.deepEqual(K.resolvedGame(sh, s), { version: 1, class: 'ship', family: 'fret', tier: 'III', ftl: true, crew: 7, arch: 'Cargo modulaire', description: 'Test' });
  const st2 = K.blank('station'); st2.docking_ports = ['a.FWD', 'b.FWD']; st2.game = { berths: [{ port: 'b.FWD', cls: 'S' }], description: 'Port' };
  assert.deepEqual(K.resolvedGame(st2, s), { version: 1, class: 'station', description: 'Port', berths: [{ port: 'a.FWD', cls: 'M' }, { port: 'b.FWD', cls: 'S' }] });
});
test('gameExport : erreurs en codes et données', () => {
  const k = make({ geom: G });
  const vide = k.blank('ship');
  assert.deepEqual(k.gameExport(vide, k.analyze(vide)), { error: 'empty' });
  const st = k.blank('station'); add(k, st, 'CMD');
  st.parts.push({ id: 'prop1', key: 'PROP', parent: 'cmd1', pport: 'AFT', port: 'FWD', roll: 0, containers: null });
  const ae = k.analyze(st), re = k.gameExport(st, ae);
  assert.equal(re.error, 'has_errors'); assert.equal(re.issue.code, 'station_prop');
  const np = ship(k, { noProp: true });
  assert.deepEqual(k.gameExport(np, k.analyze(np)), { error: 'no_prop' });
  const c = ship(k), a = k.analyze(c);
  assert.deepEqual(k.gameExport(c, a), { error: 'no_export' });   // toExport arrive avec L2a.5
  k.toExport = (x) => ({ format: 'stt-composition', id: x.id });
  const r = k.gameExport(c, a);
  assert.equal(r.warn, 0); assert.equal(r.data.id, c.id);
  assert.deepEqual(r.data.stats, a.stats); assert.equal(r.data.game.class, 'ship');
  const w = ship(k); add(k, w, 'PROP', 'cmd1', 'FWD');
  assert.ok(k.gameExport(w, k.analyze(w)).warn >= 1);
});
test('chargement par vm : mêmes résultats que require', () => {
  const { STTCOMP: V } = loadVm();
  const kv = V.create({ geom: G, fleet: { modules: {}, container_brands: {}, zones: {}, companies: {} } });
  const c = kv.blank('ship'); const a = kv.addPart(c, 'CMD').part; kv.addPart(c, 'PWR', { id: a.id, port: 'AFT' }, 'FWD');
  const r = kv.analyze(c);
  assert.deepEqual(JSON.parse(JSON.stringify(r.stats)), JSON.parse(JSON.stringify(K.analyze((() => { const x = K.blank('ship'); const y = add(K, x, 'CMD'); add(K, x, 'PWR', y.id, 'AFT'); return x; })()).stats)));
  assert.ok(r.issues.some((i) => i.code === 'no_prop'));
});
