import test from 'node:test';
import assert from 'node:assert/strict';
import { STTCOMP, make, geomReal, fleet } from './_sttcomp.mjs';

const { m4 } = STTCOMP;
const near = (a, b, e = 1e-9) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < e, `i=${i} ${a[i]} vs ${b[i]}`); };

/* CMD puis NODE fixé sur son AFT */
function build(k) {
  const c = k.blank('ship');
  const cmd = k.addPart(c, 'CMD').part;
  const node = k.addPart(c, 'NODE', { id: cmd.id, port: 'AFT' }, 'FWD').part;
  return { c, cmd, node };
}

test('blank, ports, types', () => {
  const k = make(); const c = k.blank('station');
  assert.equal(c.id, 'u1'); assert.equal(c.type, 'station'); assert.deepEqual(c.parts, []);
  assert.deepEqual(k.portsOf('NODE'), ['AFT', 'PORT', 'STBD', 'FWD']);     // ordre PORT_PREF
  assert.deepEqual(k.portsOf('INCONNU'), []);
  assert.equal(k.portKind('BAY', 'SHUTTLE'), 'pad'); assert.equal(k.portKind('SHUTTLE', 'PAD'), 'pad'); assert.equal(k.portKind('NODE', 'FWD'), 'ring');
  assert.equal(k.massOf('CMD'), 10); assert.equal(k.massOf('PROP'), 0); assert.equal(k.massOf('X'), 50);
  assert.equal(k.lenOf('CARGO'), 10); assert.equal(k.lenOf('X'), 10);
});
test('construction, graphe, ports libres', () => {
  const k = make(); const { c, cmd, node } = build(k);
  assert.equal(cmd.id, 'cmd1'); assert.equal(node.id, 'node1'); assert.equal(node.parent, 'cmd1');
  assert.equal(k.nextId(c, 'NODE'), 'node2');
  assert.deepEqual(k.kids(c, 'cmd1').map((p) => p.id), ['node1']);
  assert.deepEqual(k.ordered(c).map((p) => p.id), ['cmd1', 'node1']);
  assert.deepEqual(k.subtree(c, 'cmd1'), ['cmd1', 'node1']);
  assert.ok(k.usedPorts(c).has('cmd1.AFT') && k.usedPorts(c).has('node1.FWD'));
  const free = k.freePorts(c);
  assert.deepEqual(free.map((f) => f.id + '.' + f.port), ['node1.AFT', 'node1.PORT', 'node1.STBD']);
  assert.ok(free.every((f) => f.kind === 'ring'));
  assert.deepEqual(k.freePorts(c, new Set(['node1'])).map((f) => f.id + '.' + f.port), ['cmd1.AFT']);   // lien du sous-arbre ignoré
  assert.equal(k.part(c, 'node1'), node);
});
test('compatibilité et ports enfants', () => {
  const k = make(); const c = k.blank('ship');
  assert.equal(k.compatible(c, 'PROP', { kind: 'ring' }), true);
  assert.equal(k.compatible(c, 'PROP', { kind: 'pad' }), false);
  assert.equal(k.compatible(c, 'SHUTTLE', { kind: 'pad' }), true);
  c.type = 'station'; assert.equal(k.compatible(c, 'PROP', { kind: 'ring' }), false);
  assert.deepEqual(k.childPorts('SHUTTLE', 'pad'), ['PAD']);
  assert.equal(k.defaultChildPort('NODE', 'NODE', 'FWD'), 'AFT');
  assert.equal(k.defaultChildPort('NODE', 'NODE', 'PORT'), 'FWD');
  assert.equal(k.defaultChildPort('SHUTTLE', 'BAY', 'SHUTTLE'), 'PAD');
  assert.equal(k.defaultChildPort('CMD', 'NODE', 'AFT'), 'AFT');
  assert.equal(k.defaultChildPort('CMD', 'BAY', 'SHUTTLE'), null);
});
test('mate et world', () => {
  const k = make(); const { c } = build(k);
  const W = k.world(c);
  near(W.get('cmd1'), m4.translation(0, 0, 0));
  // Ps = socket AFT du CMD (z-4) ; mate = Ps*RX*inv(socket FWD du NODE = z+2)
  const expected = m4.mul(m4.mul(m4.translation(0, 0, -4), m4.RX), m4.translation(0, 0, -2));
  near(W.get('node1'), expected);
  near(m4.point(W.get('node1'), [0, 0, 2]), [0, 0, -4]);                 // le FWD du nœud tombe sur l'AFT du CMD
  near(m4.dir(W.get('node1'), [0, 0, 1]), [0, 0, -1]);                   // RX retourne l'axe
  near(m4.point(k.mate(m4.identity(), 'NODE', 'FWD', 90), [0, 0, 2]), [0, 0, 0]);
  // racines multiples décalées de 60 m
  c.parts.push({ id: 'cmd2', key: 'CMD', parent: null, pport: null, port: null, roll: 0 });
  near(m4.pos(k.world(c).get('cmd2')), [60, 0, 0]);
  assert.throws(() => k.socketLocal('CMD', 'FWD'), /introuvable/);
  // socket absent : pièce ignorée, sans exception
  c.parts.push({ id: 'x', key: 'CMD', parent: 'cmd1', pport: 'FWD', port: 'AFT', roll: 0 });
  assert.equal(k.world(c).has('x'), false);
});
test('conteneurs', () => {
  const k = make(); const l = k.containerMats('CARGO');
  assert.deepEqual(l.map((x) => x.slot), ['01', '02']);
  assert.equal(l[0].M.length, 16); assert.equal(l[0].dir.length, 3);
  assert.ok(Math.abs(Math.hypot(...l[0].dir) - 1) < 1e-9);
  assert.deepEqual(k.containerMats('CMD'), []);
});
test('addPart : codes et marques injectées', () => {
  const k = make();
  const c2 = k.blank('ship'); k.addPart(c2, 'CMD');
  assert.deepEqual(k.addPart(c2, 'NODE'), { ok: false, code: 'need_port' });
  const s = k.blank('station'); const n = k.addPart(s, 'NODE').part;
  n.zone = 'Z1';
  assert.deepEqual(k.addPart(s, 'PROP', { id: n.id, port: 'FWD' }, 'FWD'), { ok: false, code: 'station_prop' });
  const r = k.addPart(s, 'CARGO', { id: n.id, port: 'FWD' }, 'AFT', 90);
  assert.equal(r.part.zone, 'Z1'); assert.equal(r.part.roll, 90); assert.equal(r.part.pport, 'FWD');
  assert.equal(r.part.containers.length, 2);
  assert.ok(r.part.containers.every((b) => ['ACME', 'ZED', 'QUX'].includes(b)));
  const k2 = make(), k3 = make();
  assert.deepEqual(k2.addPart(k2.blank(), 'CARGO').part.containers, k3.addPart(k3.blank(), 'CARGO').part.containers);
});
test('movePart', () => {
  const k = make(); const { c } = build(k);
  const n2 = k.addPart(c, 'NODE', { id: 'node1', port: 'AFT' }, 'FWD').part;
  c.extra_links.push(['node1.PORT', 'node2.STBD'], ['cmd1.AFT', 'x.FWD']);
  assert.deepEqual(k.movePart(c, 'node2', { id: 'node1', port: 'PORT' }, 'AFT', 45), { ok: true });
  assert.deepEqual([n2.parent, n2.pport, n2.port, n2.roll], ['node1', 'PORT', 'AFT', 45]);
  assert.deepEqual(c.extra_links, [['cmd1.AFT', 'x.FWD']]);
  assert.equal(k.movePart(c, 'zzz', { id: 'a', port: 'b' }, 'c', 0).ok, false);
});
test('deletePart', () => {
  const k = make(); const { c } = build(k);
  k.addPart(c, 'NODE', { id: 'node1', port: 'AFT' }, 'FWD');
  assert.deepEqual(k.deletePart(c, 'node1'), { ok: true, removed: 2 });
  assert.deepEqual(c.parts.map((p) => p.id), ['cmd1']);
});
test('replacePart', () => {
  const k = make(); const { c } = build(k);
  const cg = k.addPart(c, 'CARGO', { id: 'node1', port: 'AFT' }, 'FWD').part;
  k.addPart(c, 'NODE', { id: cg.id, port: 'AFT' }, 'FWD');
  // CARGO -> BAY : pas d'AFT sur BAY, l'enfant du port AFT est retiré
  const r = k.replacePart(c, cg.id, 'BAY');
  assert.deepEqual(r, { ok: true, removed: 1 });
  assert.equal(cg.key, 'BAY'); assert.equal(cg.containers, null); assert.equal(cg.port, 'FWD');
  assert.equal(c.parts.length, 3);
  // pad -> ring impossible : SHUTTLE (pad) remplacé par NODE (ring seulement)
  const sh = k.addPart(c, 'SHUTTLE', { id: cg.id, port: 'SHUTTLE' }, 'PAD').part;
  assert.deepEqual(k.replacePart(c, sh.id, 'NODE'), { ok: false, code: 'port_incompatible' });
  assert.equal(sh.key, 'SHUTTLE');
  assert.equal(k.replacePart(c, sh.id, 'SHUTTLE').ok, false);            // même clé
  assert.equal(k.replacePart(c, 'node1', 'CARGO').ok, true);
  assert.equal(k.part(c, 'node1').containers.length, 2);
});
test("normalize : orphelins, liens, ports d'amarrage (sans état global)", () => {
  const k = make(); const { c } = build(k);
  c.parts.push({ id: 'orph', key: 'NODE', parent: 'ghost', pport: 'AFT', port: 'FWD' }, { id: 'o2', key: 'NODE', parent: 'orph', pport: 'AFT', port: 'FWD' });
  c.extra_links = [['node1.PORT', 'cmd1.AFT'], ['ghost.X', 'cmd1.AFT'], ['o2.AFT', 'cmd1.AFT']];
  c.docking_ports = ['node1.AFT', 'node1.AFT', 'cmd1.AFT', 'ghost.FWD', 'node1.PORT'];
  const other = k.blank();
  assert.equal(k.normalize(c), c);
  assert.deepEqual(c.parts.map((p) => p.id), ['cmd1', 'node1']);
  assert.deepEqual(c.extra_links, [['node1.PORT', 'cmd1.AFT']]);
  assert.deepEqual(c.docking_ports, ['node1.AFT']);                      // cmd1.AFT et node1.PORT utilisés
  assert.deepEqual(other.parts, []);
});
test('géométrie réelle (si modules-geom.json existe)', { skip: !geomReal() }, () => {
  const g = geomReal(); const k = make({ geom: g, fleet });
  for (const key of Object.keys(g.modules)) {
    assert.ok(k.portsOf(key).length > 0, key);
    for (const p of k.portsOf(key)) assert.equal(k.socketLocal(key, p).length, 16);
  }
  const c = k.blank('ship'); k.addPart(c, 'CMD');
  const f = k.freePorts(c)[0];
  assert.equal(k.addPart(c, 'NODE6', f, k.defaultChildPort('NODE6', 'CMD', f.port)).ok, true);
  assert.equal(k.world(c).size, 2);
});
