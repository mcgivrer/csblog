/* Invariants de la couche sim/ (contrat L0) : en-têtes, une globale par fichier, pas de THREE / Math.random / DOM nu */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, simFiles, plain } from './_load.mjs';

const ATTENDU = {
  '00-game-state.js': { header: '/* @provides GAME */', global: 'GAME' },
  '01-rng-game.js': { header: '/* @provides RNG @requires GAME @requires-engine xmur3, mulberry32, SEED */', global: 'RNG' },
  '02-data.js': { header: '/* @provides DATA */', global: 'DATA' },
  '03-save.js': { header: '/* @provides SAVE @requires GAME */', global: 'SAVE' }
};
const sansCommentaires = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fichiers = () => simFiles().map(f => [path.basename(f), fs.readFileSync(f, 'utf8')]);

test('sim/ contient exactement les quatre fichiers du contrat L0.5', () => {
  assert.deepEqual(fichiers().map(([n]) => n), Object.keys(ATTENDU));
});

test('en-tête @provides / @requires dans les 15 premières lignes, comme dans le contrat', () => {
  for(const [nom, src] of fichiers()){
    const tete = src.split('\n').slice(0, 15);
    assert.ok(tete[0].startsWith('/* ====='), nom + ' : bandeau');
    const tags = tete.filter(l => l.includes('@provides'));
    assert.deepEqual(tags, [ATTENDU[nom].header], nom);
  }
});

test('une seule déclaration de niveau 0 par fichier : la globale de l\'espace de noms (IIFE)', () => {
  for(const [nom, src] of fichiers()){
    const decl = [...src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    assert.deepEqual(decl, [ATTENDU[nom].global], nom);
    assert.match(src, new RegExp('^const ' + ATTENDU[nom].global + ' = \\(function\\(\\)\\{', 'm'), nom);
  }
});

test('aucun Math.random, THREE ni window dans sim/ ; document seulement garde par typeof (02-data, 03-save)', () => {
  for(const [nom, src] of fichiers()){
    const code = sansCommentaires(src);
    assert.doesNotMatch(code, /Math\.random/, nom);
    assert.doesNotMatch(code, /\bTHREE\b/, nom);
    assert.doesNotMatch(code, /\bwindow\b/, nom);
    if(nom === '02-data.js' || nom === '03-save.js'){
      assert.match(code, /typeof document/, nom);
    }else{
      assert.doesNotMatch(code, /\bdocument\b/, nom);
    }
  }
  const save = sansCommentaires(fs.readFileSync(simFiles().find(f => f.endsWith('03-save.js')), 'utf8'));
  assert.doesNotMatch(save.slice(0, save.indexOf('function exportFile')), /\bdocument\./, 'SAVE : document. seulement dans exportFile');
});

test('chargement : aucune propriété globale ajoutée par sim/, seules les quatre consts existent', () => {
  const t = load();
  assert.deepEqual(t.nouvellesGlobales, []);
  assert.deepEqual(t.globalesPrng.sort(), ['mulberry32', 'rngFor', 'xmur3']);
  for(const n of ['GAME', 'RNG', 'DATA', 'SAVE']) assert.equal(t.run('typeof ' + n), 'object', n);
  assert.equal(t.run('typeof THREE'), 'undefined');
});

test('chargement en un seul script (comme le build) : mêmes espaces de noms et comportement', () => {
  const t = load({ concat: true, search: '?seed=ABC' });
  assert.deepEqual(t.nouvellesGlobales, []);
  t.GAME.newCampaign({ seed: 'ABC', startCredits: 10 });
  t.GAME.cmd('credits.set', { credits: 12, reason: 'x' });
  assert.deepEqual(plain(t.SAVE.parse(t.SAVE.serialize(t.GAME.state))), plain(t.GAME.state));
  assert.equal(typeof t.RNG.game('a')(), 'number');
  assert.deepEqual(plain(t.DATA.get('rien')), {});
});

test('headless : sans document ni localStorage, la simulation fonctionne', () => {
  const t = load({ headless: true, search: '?seed=ABC' });
  t.GAME.newCampaign({ seed: 'ABC', startCredits: 10 });
  t.GAME.tick(3);
  assert.equal(t.GAME.state.clock, 3);
  assert.equal(typeof t.RNG.game('a')(), 'number');
  assert.deepEqual(plain(t.DATA.all()), {});
  assert.deepEqual(plain(t.SAVE.parse(t.SAVE.serialize(t.GAME.state))), plain(t.GAME.state));
});

test('le PRNG du moteur est chargé tel quel : graine lue dans location.search et affichée dans #seedVal', () => {
  const t = load({ search: '?seed=XYZ' });
  assert.equal(t.SEED, 'XYZ');
  assert.equal(t.elements.seedVal.textContent, 'XYZ');
});
