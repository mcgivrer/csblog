import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, memoryStorage } from './_load.mjs';

function campagne(opts) {
  const t = load(opts);
  t.GAME.newCampaign({ seed: 'ABC-123', startCredits: 4000, starter: 'stt-courlis', name: 'Courlis I' });
  t.GAME.tick(12.5);
  t.GAME.cmd('credits.set', { credits: 4300, reason: 'mission' });
  return t;
}

test('constantes : VERSION et clés de stockage', () => {
  const { SAVE } = load();
  assert.equal(SAVE.VERSION, 1);
  assert.deepEqual(plain(SAVE.KEYS), {
    auto: 'stt.campaign.v1.auto',
    slots: ['stt.campaign.v1.slot1', 'stt.campaign.v1.slot2', 'stt.campaign.v1.slot3']
  });
  assert.deepEqual(plain(SAVE.MIGRATIONS), {});
});

test('serialize / parse : aller-retour identique', () => {
  const t = campagne();
  const txt = t.SAVE.serialize(t.GAME.state);
  assert.equal(typeof txt, 'string');
  assert.deepEqual(plain(t.SAVE.parse(txt)), plain(t.GAME.state));
});

test('write / has / read : aller-retour via le stockage, clé auto par défaut', () => {
  const t = campagne();
  assert.equal(t.SAVE.has(), false);
  assert.equal(t.SAVE.read(), null);
  assert.equal(t.SAVE.write(), true);
  assert.equal(t.SAVE.has(), true);
  assert.ok(t.localStorage.getItem('stt.campaign.v1.auto'));
  assert.deepEqual(plain(t.SAVE.read()), plain(t.GAME.state));
  const slot = t.SAVE.KEYS.slots[1];
  assert.equal(t.SAVE.has(slot), false);
  assert.equal(t.SAVE.write(slot), true);
  assert.equal(t.SAVE.has(slot), true);
  assert.deepEqual(plain(t.SAVE.read(slot)), plain(t.GAME.state));
});

test('write : false sans campagne, rien d\'écrit', () => {
  const t = load();
  assert.equal(t.SAVE.write(), false);
  assert.equal(t.SAVE.has(), false);
  assert.deepEqual(t.localStorage.keys(), []);
});

test('setStorage : stockage de remplacement, retour à localStorage avec null', () => {
  const t = campagne();
  const autre = memoryStorage();
  t.SAVE.setStorage(autre);
  assert.equal(t.SAVE.write(), true);
  assert.deepEqual(autre.keys(), ['stt.campaign.v1.auto']);
  assert.deepEqual(t.localStorage.keys(), []);
  t.SAVE.setStorage(null);
  assert.equal(t.SAVE.has(), false);
});

test('stockage défaillant : write -> false, read -> null, has -> false, jamais d\'exception', () => {
  const t = campagne();
  const quota = { getItem() { throw new Error('boum'); }, setItem() { throw new Error('quota'); } };
  t.SAVE.setStorage(quota);
  assert.equal(t.SAVE.write(), false);
  assert.equal(t.SAVE.read(), null);
  assert.equal(t.SAVE.has(), false);
});

test('localStorage inaccessible (SecurityError) ou absent : même repli', () => {
  const interdit = campagne({ setup: s => { delete s.localStorage; Object.defineProperty(s, 'localStorage', { get() { throw new Error('SecurityError'); } }); } });
  assert.equal(interdit.SAVE.write(), false);
  assert.equal(interdit.SAVE.read(), null);
  assert.equal(interdit.SAVE.has(), false);
  const absent = campagne({ setup: s => { delete s.localStorage; } });
  assert.equal(absent.SAVE.write(), false);
  assert.equal(absent.SAVE.has(), false);
  const headless = campagne({ headless: true });
  assert.equal(headless.SAVE.write(), false);
  assert.equal(headless.SAVE.exportFile(), false);
});

test('parse : save_newer si v > VERSION', () => {
  const { SAVE } = load();
  assert.throws(() => SAVE.parse(JSON.stringify({ v: 2, mode: 'campaign' })), /^Error: save_newer$/);
  assert.throws(() => SAVE.parse('{"v":99,"mode":"campaign"}'), { message: 'save_newer' });
});

test('parse : save_invalide (JSON cassé, forme, mode, version)', () => {
  const { SAVE } = load();
  const mauvais = [
    '', '{pas du json', 'null', '42', '"texte"', '[]', '{}',
    JSON.stringify({ v: 1, mode: 'free' }),
    JSON.stringify({ v: 1 }),
    JSON.stringify({ mode: 'campaign' }),
    JSON.stringify({ v: 0, mode: 'campaign' }),
    JSON.stringify({ v: '1', mode: 'campaign' }),
    JSON.stringify({ v: 1.5, mode: 'campaign' })
  ];
  for(const m of mauvais) assert.throws(() => SAVE.parse(m), { message: 'save_invalide' }, JSON.stringify(m));
  assert.throws(() => SAVE.parse(undefined), { message: 'save_invalide' });
  assert.throws(() => SAVE.serialize(null), { message: 'save_invalide' });
});

test('read : sauvegarde corrompue ou trop récente -> null (présente pour has)', () => {
  const t = load();
  t.localStorage.setItem('stt.campaign.v1.auto', '{casse');
  assert.equal(t.SAVE.has(), true);
  assert.equal(t.SAVE.read(), null);
  t.localStorage.setItem('stt.campaign.v1.auto', JSON.stringify({ v: 2, mode: 'campaign' }));
  assert.equal(t.SAVE.read(), null);
});

test('migrations : table MIGRATIONS[v], version portée à VERSION', () => {
  const t = load();
  t.SAVE.VERSION = 3;
  t.SAVE.MIGRATIONS[1] = s => Object.assign({}, s, { ajoute1: true });
  t.SAVE.MIGRATIONS[2] = s => Object.assign({}, s, { ajoute2: s.ajoute1 === true });
  const s = t.SAVE.parse(JSON.stringify({ v: 1, mode: 'campaign', seed: 'A' }));
  assert.deepEqual(plain(s), { v: 3, mode: 'campaign', seed: 'A', ajoute1: true, ajoute2: true });
  assert.deepEqual(plain(t.SAVE.parse(JSON.stringify({ v: 2, mode: 'campaign' }))), { v: 3, mode: 'campaign', ajoute2: false });
  assert.deepEqual(plain(t.SAVE.parse(JSON.stringify({ v: 3, mode: 'campaign' }))), { v: 3, mode: 'campaign' });
  assert.throws(() => t.SAVE.parse(JSON.stringify({ v: 4, mode: 'campaign' })), { message: 'save_newer' });
  delete t.SAVE.MIGRATIONS[2];
  assert.throws(() => t.SAVE.parse(JSON.stringify({ v: 1, mode: 'campaign' })), { message: 'save_invalide' });
});

test('importText : parse puis GAME.load (événement loaded), erreurs sans toucher l\'état', () => {
  const src = campagne();
  const txt = src.SAVE.serialize(src.GAME.state);
  const t = load();
  const vus = [];
  t.GAME.on('loaded', s => vus.push(s.seed));
  assert.equal(t.GAME.mode(), 'free');
  const s = t.SAVE.importText(txt);
  assert.equal(t.GAME.mode(), 'campaign');
  assert.equal(t.GAME.state, s);
  assert.deepEqual(plain(t.GAME.state), plain(src.GAME.state));
  assert.deepEqual(vus, ['ABC-123']);
  assert.throws(() => t.SAVE.importText('{casse'), { message: 'save_invalide' });
  assert.throws(() => t.SAVE.importText('{"v":2,"mode":"campaign"}'), { message: 'save_newer' });
  assert.equal(t.GAME.state, s);
  assert.deepEqual(vus, ['ABC-123']);
});

test('exportFile : télécharge stt-campagne-<seed>.stt-save.json', () => {
  const crees = [], clics = [], retires = [], ajoutes = [], revoques = [];
  const a = { click() { clics.push(this.download); } };
  const doc = {
    createElement: tag => { assert.equal(tag, 'a'); return a; },
    body: { appendChild: e => ajoutes.push(e), removeChild: e => retires.push(e) }
  };
  const t = campagne({
    document: doc,
    setup: s => {
      s.Blob = class { constructor(parts, o) { this.parts = parts; this.type = o.type; } };
      s.URL = { createObjectURL: b => { crees.push(b); return 'blob:test'; }, revokeObjectURL: u => revoques.push(u) };
    }
  });
  assert.equal(t.SAVE.exportFile(), true);
  assert.equal(a.download, 'stt-campagne-ABC-123.stt-save.json');
  assert.equal(a.href, 'blob:test');
  assert.deepEqual(clics, [a.download]);
  assert.equal(ajoutes.length, 1);
  assert.equal(retires.length, 1);
  assert.equal(crees[0].type, 'application/json');
  assert.deepEqual(plain(t.SAVE.parse(crees[0].parts[0])), plain(t.GAME.state));
  assert.deepEqual(revoques, []);
  t.timers[0].fn();
  assert.deepEqual(revoques, ['blob:test']);
  assert.equal(t.timers[0].ms, 1000);
});

test('exportFile : nom de fichier sûr pour une graine à caractères spéciaux, false sans campagne', () => {
  const a = { click() {} };
  const doc = { createElement: () => a, body: { appendChild() {}, removeChild() {} } };
  const t = load({ document: doc, setup: s => { s.Blob = class { constructor(p) { this.p = p; } }; s.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} }; } });
  assert.equal(t.SAVE.exportFile(), false);
  t.GAME.newCampaign({ seed: 'été/2026 x' });
  assert.equal(t.SAVE.exportFile(), true);
  assert.equal(a.download, 'stt-campagne-_t_2026_x.stt-save.json');
});

test('exportFile : false sans Blob ni URL', () => {
  const t = load({ document: { createElement() { throw new Error('ne doit pas être appelé'); } } });
  t.GAME.newCampaign({ seed: 'A' });
  assert.equal(t.SAVE.exportFile(), false);
});
