import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load, plain, ECONOMY_FILE } from './_load.mjs';

const economy = JSON.parse(fs.readFileSync(ECONOMY_FILE, 'utf8'));

test('DATA.get : table de #sttData, {} si absente', () => {
  const t = load({ data: { economy, autre: { a: 1 } } });
  assert.deepEqual(plain(t.DATA.get('economy')), economy);
  assert.deepEqual(plain(t.DATA.get('autre')), { a: 1 });
  assert.deepEqual(plain(t.DATA.get('absent')), {});
  assert.deepEqual(plain(t.DATA.get('constructor')), {});
  assert.deepEqual(plain(t.DATA.get('__proto__')), {});
  assert.deepEqual(plain(t.DATA.get(undefined)), {});
});

test('DATA.all : tout l\'objet embarqué', () => {
  const t = load({ data: { economy } });
  assert.deepEqual(plain(t.DATA.all()), { economy });
});

test('DATA : lecture unique du DOM, mise en cache', () => {
  const t = load({ data: { a: { n: 1 } } });
  assert.equal(t.DATA.get('a'), t.DATA.get('a'));
  t.elements.sttData.textContent = JSON.stringify({ a: { n: 2 } });
  assert.equal(t.DATA.get('a').n, 1);
  t.DATA._set();   // sans argument : nouvelle lecture
  assert.equal(t.DATA.get('a').n, 2);
});

test('DATA._set : remplace le cache (tests)', () => {
  const t = load({ data: { a: { n: 1 } } });
  t.DATA._set({ economy });
  assert.deepEqual(plain(t.DATA.get('economy')), economy);
  assert.deepEqual(plain(t.DATA.get('a')), {});
  assert.equal(Object.keys(t.DATA.all()).join(), 'economy');
});

test('DATA : #sttData vide, absent, illisible ou non-objet -> {} sans exception', () => {
  const vide = load();
  assert.deepEqual(plain(vide.DATA.get('economy')), {});
  assert.deepEqual(plain(vide.DATA.all()), {});

  const absent = load({ document: { getElementById: id => (id === 'seedVal' ? { textContent: '' } : null) } });
  assert.deepEqual(plain(absent.DATA.get('economy')), {});

  const casse = load();
  casse.elements.sttData = { textContent: '{pas du json' };
  assert.deepEqual(plain(casse.DATA.get('economy')), {});
  assert.equal(casse.logs.filter(l => l[0] === 'error').length, 1);

  const tableau = load({ data: [1, 2] });
  assert.deepEqual(plain(tableau.DATA.all()), {});
});

test('DATA : sans document (garde typeof) -> {}', () => {
  const t = load({ headless: true });
  assert.deepEqual(plain(t.DATA.get('economy')), {});
});

test('economy.json : champs exigés par le build et valeurs du contrat', () => {
  assert.deepEqual(economy, { startCredits: 4000, starter: 'stt-courlis', autosaveSeconds: 120, tickSeconds: 1 });
});
