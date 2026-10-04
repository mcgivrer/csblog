import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './_load.mjs';

const camp = (t, o = {}) => t.GAME.newCampaign({ seed: 'ABC', startCredits: 4000, starter: 'stt-courlis', name: 'Courlis I', ...o });

test('newCampaign : forme de l\'état SPEC-010 § 2.5', () => {
  const { GAME } = load();
  assert.equal(GAME.state, null);
  assert.equal(GAME.mode(), 'free');
  const s = GAME.newCampaign({ seed: 'ABC', startCredits: 4000, starter: 'stt-courlis', name: 'Courlis I' });
  assert.equal(GAME.state, s);
  assert.equal(GAME.mode(), 'campaign');
  assert.deepEqual(plain(s), {
    v: 1, mode: 'campaign', seed: 'ABC', clock: 0,
    company: { name: 'STT', mark: 'STT', livery_hex: '#2d6cdf', emblem: 'star4', reputation: 0 },
    credits: 4000, rp: 0, ledger: [], flagship: 's1',
    ships: [{ id: 's1', name: 'Courlis I', comp: 'stt-courlis', wear: 0, fuel: 1, at: null, order: null, crew: [] }],
    blueprints: {}, crew: [], tech: { done: [], queue: [] }, stations: [],
    missions: { active: null, serial: 0 }, flags: {}
  });
});

test('newCampaign : valeurs par défaut sans option, et une campagne remplace la précédente', () => {
  const { GAME } = load();
  const s = GAME.newCampaign();
  assert.equal(s.credits, 0);
  assert.equal(s.seed, 'STT');
  assert.equal(s.ships[0].comp, 'stt-courlis');
  const s2 = GAME.newCampaign({ seed: 42, startCredits: 10 });
  assert.equal(s2.seed, '42');
  assert.notEqual(GAME.state, s);
});

test('newCampaign : états indépendants (pas de structure partagée)', () => {
  const { GAME } = load();
  const a = plain(GAME.newCampaign({ seed: 'A' }));
  const b = GAME.newCampaign({ seed: 'B' });
  b.ships[0].crew.push('x'); b.flags.k = 1; b.tech.done.push('t');
  assert.deepEqual(a.ships[0].crew, []);
  assert.deepEqual(a.flags, {});
});

test('événements new / loaded et désabonnement', () => {
  const { GAME } = load();
  const vus = [];
  const offNew = GAME.on('new', s => vus.push(['new', s.seed]));
  GAME.on('loaded', s => vus.push(['loaded', s.seed]));
  GAME.newCampaign({ seed: 'A' });
  GAME.load(plain(GAME.state));
  assert.deepEqual(vus, [['new', 'A'], ['loaded', 'A']]);
  assert.equal(typeof offNew, 'function');
  offNew();
  offNew();   // idempotent
  GAME.newCampaign({ seed: 'B' });
  assert.deepEqual(vus, [['new', 'A'], ['loaded', 'A']]);
});

test('désabonnement : un écouteur retiré pendant l\'émission n\'est pas appelé, le même fn peut être inscrit deux fois', () => {
  const { GAME } = load();
  const appels = [];
  let offB;
  GAME.on('x', () => { appels.push('A'); offB(); });
  offB = GAME.on('x', () => appels.push('B'));
  GAME.emit('x');
  assert.deepEqual(appels, ['A']);
  const f = () => appels.push('f');
  const off1 = GAME.on('y', f);
  GAME.on('y', f);
  off1();
  GAME.emit('y');
  assert.equal(appels.filter(a => a === 'f').length, 1);
  assert.throws(() => GAME.on('x', 'pas une fonction'), { name: 'TypeError', message: 'ecouteur_invalide' });
});

test('emit : une erreur d\'écouteur est journalisée, jamais propagée, les autres écouteurs sont appelés', () => {
  const t = load();
  const vus = [];
  t.GAME.on('e', () => { throw new Error('boum'); });
  t.GAME.on('e', d => vus.push(d));
  assert.doesNotThrow(() => t.GAME.emit('e', 7));
  assert.deepEqual(vus, [7]);
  assert.equal(t.logs.length, 1);
  assert.equal(t.logs[0][0], 'error');
  assert.doesNotThrow(() => t.GAME.emit('jamais-inscrit'));
});

test('reset et load', () => {
  const { GAME } = load();
  camp({ GAME });
  GAME.reset();
  assert.equal(GAME.state, null);
  assert.equal(GAME.mode(), 'free');
  const s = { v: 1, mode: 'campaign', seed: 'Z', clock: 5, credits: 1 };
  assert.equal(GAME.load(s), s);
  assert.equal(GAME.state, s);
  assert.equal(GAME.mode(), 'campaign');
  assert.throws(() => GAME.load(null), /etat_invalide/);
  assert.throws(() => GAME.load('x'), /etat_invalide/);
  assert.equal(GAME.state, s);
});

test('cmd credits.set : solde, ledger [clock, raison, delta], événement credits', () => {
  const t = load();
  camp(t);
  const vus = [];
  t.GAME.on('credits', d => vus.push(plain(d)));
  t.GAME.tick(2.5);
  t.GAME.cmd('credits.set', { credits: 4500, reason: 'mission' });
  t.GAME.cmd('credits.set', { credits: 4200, reason: 'carburant' });
  assert.equal(t.GAME.state.credits, 4200);
  assert.deepEqual(plain(t.GAME.state.ledger), [[2.5, 'mission', 500], [2.5, 'carburant', -300]]);
  assert.deepEqual(vus, [
    { credits: 4500, delta: 500, reason: 'mission' },
    { credits: 4200, delta: -300, reason: 'carburant' }
  ]);
});

test('cmd credits.set : raison par défaut et valeurs refusées', () => {
  const t = load();
  camp(t);
  t.GAME.cmd('credits.set', { credits: 1 });
  assert.equal(t.GAME.state.ledger[0][1], 'divers');
  for(const mauvais of [undefined, null, '5', NaN, Infinity]){
    assert.throws(() => t.GAME.cmd('credits.set', { credits: mauvais }), /credits_invalide/);
  }
  assert.throws(() => t.GAME.cmd('credits.set'), /credits_invalide/);
  assert.equal(t.GAME.state.credits, 1);
  assert.equal(t.GAME.state.ledger.length, 1);
});

test('ledger plafonné à 200 entrées (les plus anciennes sont écartées)', () => {
  const t = load();
  camp(t, { startCredits: 0 });
  for(let i = 1; i <= 250; i++) t.GAME.cmd('credits.set', { credits: i, reason: 'r' + i });
  const l = t.GAME.state.ledger;
  assert.equal(l.length, 200);
  assert.equal(l[0][1], 'r51');
  assert.equal(l[199][1], 'r250');
  assert.equal(t.GAME.state.credits, 250);
});

test('cmd : commande inconnue, et campagne requise', () => {
  const t = load();
  assert.throws(() => t.GAME.cmd('nimporte.quoi'), /cmd_inconnue/);
  assert.throws(() => t.GAME.cmd('toString'), /cmd_inconnue/);
  assert.throws(() => t.GAME.cmd('credits.set', { credits: 1 }), /pas_de_campagne/);
  camp(t);
  assert.throws(() => t.GAME.cmd('nimporte.quoi', {}), /cmd_inconnue/);
});

test('tick : 3 × 0,4 s -> un seul événement, à 1,2 s', () => {
  const t = load();
  camp(t);
  const vus = [];
  t.GAME.on('tick', d => vus.push(d.clock));
  t.GAME.tick(0.4); t.GAME.tick(0.4);
  assert.deepEqual(vus, []);
  t.GAME.tick(0.4);
  assert.deepEqual(vus, [1]);
  assert.equal(t.GAME.state.clock, 1.2);
});

test('tick : un événement par seconde entière franchie, sans dérive flottante', () => {
  const t = load();
  camp(t);
  const vus = [];
  t.GAME.on('tick', d => vus.push(d.clock));
  for(let i = 0; i < 10; i++) t.GAME.tick(0.1);
  assert.deepEqual(vus, [1]);
  assert.equal(t.GAME.state.clock, 1);
  t.GAME.tick(2.5);
  assert.deepEqual(vus, [1, 2, 3]);
  assert.equal(t.GAME.state.clock, 3.5);
});

test('tick : sans campagne ou avec dt invalide, rien ne bouge', () => {
  const t = load();
  const vus = [];
  t.GAME.on('tick', d => vus.push(d));
  assert.equal(t.GAME.tick(5), null);
  camp(t);
  for(const dt of [0, -1, NaN, Infinity, '1', undefined]) assert.equal(t.GAME.tick(dt), null);
  assert.equal(t.GAME.state.clock, 0);
  assert.deepEqual(vus, []);
});
