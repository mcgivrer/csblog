// modules-geom.json : schema, 13 modules, size, sha1 of the source, parity of the sockets with the pack stt_modules.glb.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../..');                       // sources/src
const GEOM = path.join(SRC, 'data/modules-geom.json');
const PACK = path.join(SRC, 'assets/stt_modules.glb');
const LIB = path.resolve(SRC, '../../STT_modules/sources/STT_ModuleLibrary.json');
const KEYS = ['BAY', 'CARGO', 'CMD', 'CRG6', 'ELBOW', 'NODE4', 'NODE6', 'PAX', 'PROP', 'PWR', 'SHUTTLE', 'TANK', 'TUNNEL'];
const raw = fs.readFileSync(GEOM);
const geom = JSON.parse(raw.toString('utf8'));

const isArr = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

test('schema', () => {
  assert.equal(geom.format, 'stt-modules-geom');
  assert.equal(geom.version, 1);
  assert.equal(geom.axes, 'gltf');
  assert.equal(geom.units, 'm');
  assert.equal(typeof geom.source, 'string');
  assert.match(geom.sha1, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(geom.modules), KEYS);
  for (const k of KEYS) {
    const m = geom.modules[k];
    assert.equal(typeof m.mass_t, 'number', k);
    assert.equal(typeof m.length_m, 'number', k);
    assert.ok(m.ports.length >= 1, k);
    assert.deepEqual(Object.keys(m.sockets).sort(), [...m.ports].sort(), k);
    for (const p of m.ports) assert.ok(isArr(m.sockets[p], 16), `${k}.${p}`);
    for (const c of m.containers) { assert.equal(typeof c.slot, 'string'); assert.ok(isArr(c.m, 16), `${k} container ${c.slot}`); }
    for (const b of [m.hull, m.full]) {
      assert.ok(isArr(b, 6), k);
      for (let i = 0; i < 3; i++) assert.ok(b[i] <= b[i + 3], k);
    }
    // the full box contains the static hull (small tolerance for rounding)
    for (let i = 0; i < 3; i++) { assert.ok(m.full[i] <= m.hull[i] + 1e-5, k); assert.ok(m.full[i + 3] >= m.hull[i + 3] - 1e-5, k); }
    if (k === 'PROP') assert.ok(isArr(m.exhaust, 16)); else assert.equal(m.exhaust, undefined, k);
  }
  // 42 SOCKET_* of the pack = 32 ports + 10 container sockets
  assert.equal(KEYS.reduce((n, k) => n + geom.modules[k].ports.length + geom.modules[k].containers.length, 0), 42);
  assert.ok(isArr(geom.container.hull, 6));
  assert.deepEqual(geom.modules.CARGO.containers.map((c) => c.slot), ['A', 'B', 'C', 'D']);
  assert.equal(geom.modules.CRG6.containers.length, 6);
});

test('taille <= 25 Ko, JSON compact', () => {
  assert.ok(raw.length <= 25 * 1024, `${raw.length} octets`);
  assert.ok(!/\n\s/.test(raw.toString('utf8')), 'pas d indentation');
});

test('sha1 de la source', { skip: !fs.existsSync(LIB) }, () => {
  assert.equal(crypto.createHash('sha1').update(fs.readFileSync(LIB)).digest('hex'), geom.sha1);
});

// ---- parity with the pack (nodes SOCKET_* composed relatively to the module root)
function glbJson(file) {
  const d = fs.readFileSync(file);
  assert.equal(d.toString('latin1', 0, 4), 'glTF');
  const len = d.readUInt32LE(12);
  return JSON.parse(d.toString('utf8', 20, 20 + len));
}
function local(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };

test('parité des sockets avec stt_modules.glb (1e-4 m)', { skip: !fs.existsSync(PACK) }, () => {
  const g = glbJson(PACK), nodes = g.nodes;
  const roots = {};
  nodes.forEach((n, i) => { const m = /^STT_([A-Z0-9]+)_ROOT$/.exec(n.name || ''); if (m) roots[m[1]] = i; });
  assert.deepEqual(Object.keys(roots).sort(), KEYS);
  let count = 0;
  for (const k of KEYS) {
    // matrices relative to the root: the root itself is the origin (parent transforms cancel out)
    const found = {}, conts = {};
    const visit = (i, M) => {
      const n = nodes[i];
      const nm = n.name || '';
      const pre = `SOCKET_${k}_`;
      if (nm.startsWith(pre) && !nm.slice(pre.length).startsWith('CONTAINER')) found[nm.slice(pre.length)] = M;
      const cm = /^SOCKET_(?:CRG6_)?CONTAINER_(.*)$/.exec(nm);
      if (cm) conts[cm[1]] = M;
      for (const c of n.children || []) visit(c, mul(M, local(nodes[c])));
    };
    visit(roots[k], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    assert.deepEqual(Object.keys(found).sort(), [...geom.modules[k].ports].sort(), `ports ${k}`);
    for (const [p, M] of Object.entries(found)) {
      const G = geom.modules[k].sockets[p];
      for (let i = 0; i < 16; i++) assert.ok(Math.abs(M[i] - G[i]) <= 1e-4, `${k}.${p}[${i}] pack ${M[i]} json ${G[i]}`);
      count++;
    }
    assert.deepEqual(Object.keys(conts).sort(), geom.modules[k].containers.map((c) => c.slot).sort(), `containers ${k}`);
    for (const c of geom.modules[k].containers) {
      for (let i = 0; i < 16; i++) assert.ok(Math.abs(conts[c.slot][i] - c.m[i]) <= 1e-4, `${k} container ${c.slot}[${i}]`);
      count++;
    }
    const meta = nodes[roots[k]].extras || {};
    assert.equal(geom.modules[k].mass_t, meta.stt_mass_t, `mass ${k}`);
    assert.equal(geom.modules[k].length_m, meta.stt_length_m, `length ${k}`);
  }
  assert.equal(count, 42);
});
