import test from 'node:test';
import assert from 'node:assert/strict';
import { deepEqual } from 'node:assert';
import { load, plain } from './_load.mjs';

const evt = (code, extra) => Object.assign({ kind: 'evt', code }, extra);
const campagne = (credits = 1000) => {
  const t = load();
  t.GAME.newCampaign({ seed: 'J', startCredits: credits });
  t.JOURNAL._reset();
  return t;
};

test('anneau de 300 entrées toutes rubriques, plus anciennes écartées, seq croissant', () => {
  const t = load();
  for(let i = 0; i < 320; i++) t.JOURNAL.add({ kind: i % 2 ? 'radio' : 'evt', code: 'x', text: 'n' + i });
  const l = t.JOURNAL.list();
  assert.equal(l.length, 300);
  assert.equal(l[0].seq, 320);
  assert.equal(l[299].seq, 21);
  assert.ok(l.every((e, i) => i === 0 || l[i - 1].seq > e.seq));
});

test('add : valide le kind, renseigne seq, t (now) et imp', () => {
  const t = load();
  assert.throws(() => t.JOURNAL.add({ kind: 'zzz' }), /kind_invalide/);
  assert.throws(() => t.JOURNAL.add(null), /entree_invalide/);
  t.JOURNAL.tickFree(5);
  const e = t.JOURNAL.add(evt('msn.done', { a: 'X' }));
  assert.equal(e.seq, 1);
  assert.equal(e.t, 5);
  assert.equal(e.imp, true);
  assert.equal(t.JOURNAL.add(evt('jump')).imp, false);
  assert.equal(t.JOURNAL.add({ kind: 'radio', t: 2, from: 'ship', who: 'a', text: 'b' }).t, 2);
});

test('list : filtres par kinds et limit, plus récent d\'abord', () => {
  const t = load();
  t.JOURNAL.add({ kind: 'radio', text: 'r1' });
  t.JOURNAL.add(evt('jump'));
  t.JOURNAL.add({ kind: 'radio', text: 'r2' });
  t.JOURNAL.add({ kind: 'fin', reason: 'jeu', delta: 5, bal: 5 });
  deepEqual(t.JOURNAL.list({ kinds: ['radio'] }).map(e => e.text), ['r2', 'r1']);
  assert.equal(t.JOURNAL.list({ kinds: ['radio', 'evt'] }).length, 3);
  assert.equal(t.JOURNAL.list({ limit: 2 }).length, 2);
  assert.equal(t.JOURNAL.list({ limit: 2 })[0].kind, 'fin');
  assert.equal(t.JOURNAL.list({ kinds: [] }).length, 4);
});

test('ledgerRows : bal recalculé à rebours depuis credits, chronologique', () => {
  const t = campagne(0);
  t.GAME.cmd('credits.set', { credits: 100, reason: 'a' });
  t.GAME.cmd('credits.set', { credits: 70, reason: 'b' });
  t.GAME.cmd('credits.set', { credits: 250, reason: 'c' });
  deepEqual(plain(t.JOURNAL.ledgerRows(t.GAME.state)), [
    { t: 0, kind: 'fin', reason: 'a', delta: 100, bal: 100 },
    { t: 0, kind: 'fin', reason: 'b', delta: -30, bal: 70 },
    { t: 0, kind: 'fin', reason: 'c', delta: 180, bal: 250 }
  ]);
  deepEqual(t.JOURNAL.ledgerRows(null), []);
  deepEqual(t.JOURNAL.ledgerRows({ credits: 5 }), []);
});

test('ledgerRows : solde juste même quand le plafond de 200 a écarté des lignes', () => {
  const t = campagne(0);
  for(let i = 1; i <= 250; i++) t.GAME.cmd('credits.set', { credits: i * 10, reason: 'r' });
  const rows = t.JOURNAL.ledgerRows(t.GAME.state);
  assert.equal(rows.length, 200);
  assert.equal(rows[199].bal, 2500);
  assert.equal(rows[0].bal, 510);
});

test('campagne : list fusionne le grand livre, les fin ne sont pas dupliquées dans l\'anneau', () => {
  const t = campagne(0);
  t.GAME.tick(10);
  t.GAME.cmd('credits.set', { credits: 50, reason: 'delivery' });
  t.GAME.tick(5);
  t.JOURNAL.add(evt('jump'));
  const fin = t.JOURNAL.add({ kind: 'fin', reason: 'doublon', delta: 1, bal: 1 });
  assert.equal(fin.kind, 'fin');
  const l = t.JOURNAL.list();
  deepEqual(l.map(e => e.kind + ':' + (e.code || e.reason)), ['evt:jump', 'fin:delivery']);
  assert.equal(l[0].t, 15);
  assert.equal(l[1].t, 10);
  deepEqual(t.JOURNAL.list({ kinds: ['evt'] }).map(e => e.kind), ['evt']);
  deepEqual(t.JOURNAL.list({ kinds: ['fin'] }).map(e => e.reason), ['delivery']);
});

test('unread / markRead : seules les entrées evt importantes comptent', () => {
  const t = load();
  t.JOURNAL.add({ kind: 'radio', text: 'x' });
  t.JOURNAL.add(evt('jump'));
  assert.equal(t.JOURNAL.unread(), 0);
  t.JOURNAL.add(evt('msn.done'));
  t.JOURNAL.add(evt('fuel.low'));
  t.JOURNAL.add(evt('fuel.crit'));
  assert.equal(t.JOURNAL.unread(), 3);
  t.JOURNAL.markRead();
  assert.equal(t.JOURNAL.unread(), 0);
  t.JOURNAL.add(evt('fuel.crit'));
  assert.equal(t.JOURNAL.unread(), 1);
});

test('on(add) : désabonnement idempotent, erreur d\'écouteur journalisée et non propagée', () => {
  const t = load();
  const vus = [];
  const off = t.JOURNAL.on('add', e => vus.push(e.seq));
  t.JOURNAL.on('add', () => { throw new Error('boum'); });
  t.JOURNAL.on('add', e => vus.push('c' + e.seq));
  assert.doesNotThrow(() => t.JOURNAL.add(evt('jump')));
  deepEqual(vus, [1, 'c1']);
  assert.ok(t.logs.some(l => l[0] === 'error' && String(l[1]).includes('JOURNAL')));
  off(); off();
  t.JOURNAL.add(evt('jump'));
  deepEqual(vus, [1, 'c1', 'c2']);
  assert.throws(() => t.JOURNAL.on('add', 5), /ecouteur_invalide/);
});

const base = () => ({ phase: 'CRUISE', legName: 'Alpha', missionTarget: null, active: null, doneCount: 0, jump: false, nearPort: false, fuelRatio: 0.8 });
const codes = (prev, snap, t = load()) => t.JOURNAL.detect(prev, snap).map(e => e.code);

test('detect : une transition par code', () => {
  const t = load();
  const p = base();
  deepEqual(codes(p, { ...p, active: { id: 'm1', dest: 'Zeta', reward: 90 } }, t), ['msn.accept']);
  const acc = t.JOURNAL.detect(p, { ...p, active: { id: 'm1', dest: 'Zeta', reward: 90 } })[0];
  deepEqual(plain(acc), { kind: 'evt', code: 'msn.accept', a: 'Zeta', b: 90, imp: false });
  const pm = { ...p, active: { id: 'm1', dest: 'Zeta', reward: 90 } };
  const done = t.JOURNAL.detect(pm, { ...p, active: null, doneCount: 1 });
  deepEqual(done.map(e => [e.code, e.a, e.b, e.imp]), [['msn.done', 'Zeta', 90, true]]);
  deepEqual(codes(p, { ...p, phase: 'JUMP' }, t), ['jump']);
  deepEqual(codes(p, { ...p, phase: 'WARP' }, t), ['jump']);
  deepEqual(codes(p, { ...p, jump: true }, t), ['jump']);
  deepEqual(codes({ ...p, phase: 'WARP' }, { ...p, phase: 'WARPOUT' }, t), ['arrive']);
  deepEqual(codes({ ...p, jump: true }, { ...p, jump: false }, t), ['arrive']);
  deepEqual(codes(p, { ...p, phase: 'ORBIT', missionTarget: 'Lune' }, t), ['orbit']);
  assert.equal(t.JOURNAL.detect(p, { ...p, phase: 'ORBIT', missionTarget: 'Lune' })[0].a, 'Lune');
  deepEqual(codes(p, { ...p, nearPort: 'Port Z' }, t), ['dock']);
  const low = t.JOURNAL.detect(p, { ...p, fuelRatio: 0.2 });
  deepEqual(low.map(e => [e.code, e.imp, e.b]), [['fuel.low', true, 20]]);
  const crit = t.JOURNAL.detect({ ...p, fuelRatio: 0.2 }, { ...p, fuelRatio: 0.08 });
  deepEqual(crit.map(e => [e.code, e.imp]), [['fuel.crit', true]]);
});

test('detect : sur front seulement, pas de répétition d\'état stable ni d\'orbite continue', () => {
  const t = load();
  const orb = { ...base(), phase: 'ORBIT', nearPort: true, fuelRatio: 0.05, jump: false };
  deepEqual(codes(orb, { ...orb }, t), []);
  deepEqual(codes({ ...base(), fuelRatio: 0.3 }, { ...base(), fuelRatio: 0.26 }, t), []);
  deepEqual(codes({ ...base(), fuelRatio: 0.2 }, { ...base(), fuelRatio: 0.15 }, t), []);
  deepEqual(codes({ ...base(), fuelRatio: 0.3 }, { ...base(), fuelRatio: 0.05 }, t), ['fuel.crit']);
  deepEqual(codes({ ...base(), phase: 'JUMP' }, { ...base(), phase: 'WARP' }, t), []);
});

test('detect : pas d\'événement fantôme (prev null, après restore) et pas de mutation', () => {
  const t = load();
  const snap = { ...base(), phase: 'ORBIT', nearPort: 'P', fuelRatio: 0.02, active: { id: 'm', dest: 'D', reward: 1 }, doneCount: 3 };
  deepEqual(t.JOURNAL.detect(null, snap), []);
  deepEqual(t.JOURNAL.detect(undefined, snap), []);
  t.JOURNAL.restore([[1, 'jump', 'A', null]]);
  deepEqual(t.JOURNAL.detect(null, snap), []);
  deepEqual(t.JOURNAL.detect(snap, snap), []);
  const a = JSON.stringify(snap);
  t.JOURNAL.detect({ ...base() }, snap);
  assert.equal(JSON.stringify(snap), a);
  assert.equal(t.JOURNAL.list().length, 1, 'detect n\'ajoute rien à l\'anneau');
});

test('restore : accepte undefined, remplace l\'anneau, entrées lues', () => {
  const t = load();
  t.JOURNAL.add({ kind: 'radio', text: 'x' });
  t.JOURNAL.restore(undefined);
  deepEqual(t.JOURNAL.list(), []);
  t.JOURNAL.restore([[3, 'msn.done', 'Z', 50], [9, 'jump', 'Q', null], 'nawak', [1]]);
  const l = plain(t.JOURNAL.list());
  assert.equal(l.length, 2);
  deepEqual([l[1].t, l[1].code, l[1].a, l[1].b, l[1].imp, l[1].kind], [3, 'msn.done', 'Z', 50, true, 'evt']);
  assert.equal(t.JOURNAL.unread(), 0);
  assert.equal(t.JOURNAL.add(evt('jump')).seq, 3);
  t.JOURNAL.restore(null);
  deepEqual(t.JOURNAL.list(), []);
});

test('GAME.cmd journal.push : plafonné à 100, émet « journal », exige une campagne', () => {
  const t = load();
  assert.throws(() => t.GAME.cmd('journal.push', { e: [0, 'jump'] }), /pas_de_campagne/);
  t.GAME.newCampaign({ seed: 'J' });
  const vus = [];
  t.GAME.on('journal', d => vus.push(d.e));
  assert.throws(() => t.GAME.cmd('journal.push', {}), /journal_invalide/);
  assert.throws(() => t.GAME.cmd('journal.push', { e: [0, 5] }), /journal_invalide/);
  assert.equal(t.GAME.cmd('journal.push', { e: [1.5, 'jump', 'A'] }), 1);
  deepEqual(plain(t.GAME.state.journal), [[1.5, 'jump', 'A', null]]);
  for(let i = 0; i < 120; i++) t.GAME.cmd('journal.push', { e: [i, 'dock', 'P' + i, null] });
  assert.equal(t.GAME.state.journal.length, 100);
  assert.equal(t.GAME.state.journal[0][2], 'P20');
  assert.equal(t.GAME.state.journal[99][2], 'P119');
  assert.equal(vus.length, 121);
  deepEqual(plain(vus[0]), [1.5, 'jump', 'A', null]);
  assert.equal(t.GAME.newCampaign().journal.length, 0);
});

test('sauvegarde v:1 sans journal : se charge, restore(undefined) ok, journal.push recrée le champ', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'J', startCredits: 7 });
  const s = JSON.parse(t.SAVE.serialize(t.GAME.state));
  delete s.journal;
  const charge = t.SAVE.parse(JSON.stringify(s));
  assert.equal(charge.v, 1);
  assert.equal(t.SAVE.VERSION, 1);
  t.GAME.load(charge);
  assert.doesNotThrow(() => t.JOURNAL.restore(t.GAME.state.journal || []));
  assert.doesNotThrow(() => t.JOURNAL.restore(t.GAME.state.journal));
  t.GAME.cmd('journal.push', { e: [0, 'jump'] });
  assert.equal(t.GAME.state.journal.length, 1);
});

test('poids : 100 événements + 200 lignes de grand livre < 50 Ko sérialisés', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'J', startCredits: 0 });
  for(let i = 0; i < 250; i++){ t.GAME.tick(37.123); t.GAME.cmd('credits.set', { credits: i * 137, reason: 'delivery' }); }
  for(let i = 0; i < 150; i++) t.GAME.cmd('journal.push', { e: [t.GAME.state.clock, 'msn.accept', 'Système Alpha Centauri b', 12345] });
  assert.equal(t.GAME.state.journal.length, 100);
  assert.equal(t.GAME.state.ledger.length, 200);
  const n = t.SAVE.serialize(t.GAME.state).length;
  assert.ok(n < 50 * 1024, 'poids ' + n);
  deepEqual(plain(t.SAVE.parse(t.SAVE.serialize(t.GAME.state))), plain(t.GAME.state));
});

test('Partie libre : now() = horloge libre, tickFree, fin gardées dans l\'anneau', () => {
  const t = load();
  assert.equal(t.GAME.state, null);
  assert.equal(t.JOURNAL.now(), 0);
  t.JOURNAL.tickFree(1.2);
  t.JOURNAL.tickFree(0.1);
  t.JOURNAL.tickFree(-3);
  t.JOURNAL.tickFree(NaN);
  assert.equal(t.JOURNAL.now(), 1.3);
  const f = t.JOURNAL.add({ kind: 'fin', reason: 'speed', delta: 4, bal: 4 });
  assert.equal(f.t, 1.3);
  deepEqual(t.JOURNAL.list({ kinds: ['fin'] }).map(e => e.reason), ['speed']);
  t.GAME.newCampaign({ seed: 'J' });
  t.GAME.tick(7);
  assert.equal(t.JOURNAL.now(), 7);
  t.GAME.reset();
  assert.equal(t.JOURNAL.now(), 1.3);
  t.JOURNAL._reset();
  assert.equal(t.JOURNAL.now(), 0);
  deepEqual(t.JOURNAL.list(), []);
});
