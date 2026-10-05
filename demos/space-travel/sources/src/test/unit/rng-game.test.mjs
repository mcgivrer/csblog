import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const suite = (g, n = 8) => Array.from({ length: n }, () => g());

test('RNG.game : même graine + même tag = même suite', () => {
  const t = load({ search: '?seed=ABC' });
  t.GAME.newCampaign({ seed: 'ABC' });
  assert.deepEqual(suite(t.RNG.game('marche')), suite(t.RNG.game('marche')));
  const t2 = load({ search: '?seed=AUTRE' });
  t2.GAME.newCampaign({ seed: 'ABC' });
  assert.deepEqual(suite(t.RNG.game('marche')), suite(t2.RNG.game('marche')));
});

test('RNG.game : tags et graines différents -> suites différentes ; valeurs dans [0, 1[', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'ABC' });
  const a = suite(t.RNG.game('a')), b = suite(t.RNG.game('b'));
  assert.notDeepEqual(a, b);
  t.GAME.newCampaign({ seed: 'XYZ' });
  assert.notDeepEqual(a, suite(t.RNG.game('a')));
  for(const x of suite(t.RNG.game('a'), 200)) assert.ok(x >= 0 && x < 1);
});

test('RNG.game : formule du contrat mulberry32(xmur3(seed + \':game:\' + tag)())', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'ABC' });
  const attendu = t.mulberry32(t.xmur3('ABC:game:t1')());
  assert.deepEqual(suite(t.RNG.game('t1')), suite(attendu));
});

test('RNG.game : chaque appel crée un générateur indépendant (pas d\'état partagé)', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'ABC' });
  const g1 = t.RNG.game('x'), g2 = t.RNG.game('x');
  const a = g1(); g1(); g1();
  assert.equal(g2(), a);
});

test('RNG.game : sans campagne, retombe sur SEED de l\'univers (?seed=)', () => {
  const t = load({ search: '?seed=ABC' });
  assert.equal(t.SEED, 'ABC');
  const hors = suite(t.RNG.game('m'));
  t.GAME.newCampaign({ seed: 'ABC' });
  assert.deepEqual(hors, suite(t.RNG.game('m')));
  t.GAME.reset();
  assert.deepEqual(hors, suite(t.RNG.game('m')));
});

test('RNG.game : la graine rechargée d\'une sauvegarde redonne la même suite', () => {
  const t = load();
  t.GAME.newCampaign({ seed: 'ABC' });
  const avant = suite(t.RNG.game('m'));
  const s = t.SAVE.serialize(t.GAME.state);
  t.GAME.reset();
  t.SAVE.importText(s);
  assert.deepEqual(avant, suite(t.RNG.game('m')));
});
