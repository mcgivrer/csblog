import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { STTCOMP, loadVm } from './_sttcomp.mjs';

const { m4, v3 } = STTCOMP;
const near = (a, b, e = 1e-9) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < e, `i=${i} ${a[i]} vs ${b[i]}`); };

test('chargement par require et par vm', () => {
  const R = createRequire(import.meta.url)('../../../../shared/sttcomp.js');
  assert.equal(typeof R.create, 'function');
  assert.equal(typeof R.m4.mul, 'function');
  assert.equal(typeof loadVm().STTCOMP.create, 'function');
  assert.deepEqual(Object.keys(loadVm().ctx).sort(), ['STTCOMP']);   // une seule globale
});
test('identité et colonne-major', () => {
  const I = m4.identity(); assert.ok(I instanceof Float64Array); assert.equal(I.length, 16);
  near(I, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const t = m4.translation(1, 2, 3); assert.deepEqual([t[12], t[13], t[14]], [1, 2, 3]);
  assert.deepEqual(m4.pos(t), [1, 2, 3]);
});
test("produit : ordre a*b (b appliquée d'abord)", () => {
  const m = m4.mul(m4.translation(10, 0, 0), m4.rotY(Math.PI / 2));
  near(m4.point(m, [0, 0, 1]), [11, 0, 0]);          // rotY(90°) : z -> x, puis +10
  near(m4.mul(m4.identity(), m), m);
  const out = new Float64Array(16); m4.mul(m, m4.identity(), out); near(out, m);
  const a = m4.rotX(0.3); m4.mul(a, a, a); near(a, m4.rotX(0.6));   // out = a, sans corruption
});
test('inverse sur affine', () => {
  const m = m4.fromTRS([1, -2, 3], [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)], [2, 3, 0.5]);
  near(m4.mul(m, m4.invert(m)), m4.identity());
  near(m4.mul(m4.invert(m), m), m4.identity());
  const r = m4.mul(m4.translation(4, 5, 6), m4.rotX(1)); near(m4.mul(r, m4.invert(r)), m4.identity());
});
test('rotX / rotY (convention THREE)', () => {
  near(m4.point(m4.rotX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
  near(m4.point(m4.rotY(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
  near(m4.dir(m4.rotY(Math.PI / 2), [1, 0, 0]), [0, 0, -1]);
  near(m4.dir(m4.translation(5, 5, 5), [1, 2, 3]), [1, 2, 3]);
});
test('basis et fromTRS', () => {
  const b = m4.basis([0, 1, 0], [0, 0, 1], [1, 0, 0], [7, 8, 9]);
  near(m4.col(b, 0), [0, 1, 0]); near(m4.col(b, 2), [1, 0, 0]); near(m4.pos(b), [7, 8, 9]);
  const q = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];     // 90° autour de Y
  near(m4.fromTRS([1, 2, 3], q, [1, 1, 1]), m4.mul(m4.translation(1, 2, 3), m4.rotY(Math.PI / 2)));
  near(m4.fromTRS([0, 0, 0], [0, 0, 0, 1], [2, 3, 4]), [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
});
test('C, Ci, RX', () => {
  near(m4.mul(m4.C, m4.Ci), m4.identity());
  near(m4.point(m4.C, [1, 2, 3]), [1, 3, -2]);            // Blender Z haut -> glTF Y haut
  near(m4.point(m4.RX, [0, 1, 2]), [0, -1, -2]);
});
test('aides v3', () => {
  assert.equal(v3.dot([1, 2, 3], [4, 5, 6]), 32);
  assert.deepEqual(v3.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(v3.sub([3, 3, 3], [1, 2, 3]), [2, 1, 0]);
  assert.deepEqual(v3.add([1, 2, 3], [1, 1, 1]), [2, 3, 4]);
  assert.deepEqual(v3.scale([1, 2, 3], 2), [2, 4, 6]);
  assert.equal(v3.len([3, 4, 0]), 5);
  near(v3.norm([0, 3, 4]), [0, 0.6, 0.8]);
});
