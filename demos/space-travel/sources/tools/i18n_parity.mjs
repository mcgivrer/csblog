#!/usr/bin/env node
/*
 * Parité i18n — compare les clés de I18N.fr / en / de / es (ensemble des clés de toutes les langues).
 *
 *   node tools/i18n_parity.mjs [fichier.js]
 *
 * Extrait le littéral « const I18N = { … } » de src/JS/game/01-internationalisation-…js (appariement
 * d'accolades, chaînes et commentaires ignorés), l'évalue dans un contexte `vm` isolé, puis liste les clés
 * absentes de chaque langue. Appelé par `python3 build.py compile` quand node est présent.
 *
 * Sortie : 0 ou plusieurs lignes d'avertissement, puis une ligne de synthèse (stdout), code 0 ;
 * clés manquantes non exemptées : lignes d'erreur sur stderr, code 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = path.join(ROOT, 'src', 'JS', 'game', '01-internationalisation-francais-existant-anglais.js');
const LANGUES = ['fr', 'en', 'de', 'es'];

/*
 * Exemptions : clés déjà manquantes avant l'introduction du contrôle (lot L0.4), par langue.
 * Elles ne produisent qu'un avertissement ; toute AUTRE clé manquante est une erreur. Ne jamais y ajouter
 * une clé nouvelle : traduire la clé. Retirer ici une entrée dès que la traduction est ajoutée.
 * Format : { en: ['cle1', 'cle2'], de: [...], es: [...], fr: [...] }
 * État à l'écriture du contrôle : les quatre langues sont à parité (169 clés), aucune exemption.
 */
const EXEMPTIONS = {};

/** Texte du littéral objet qui suit « const I18N = » (de « { » à l'accolade fermante appariée). */
function extraireLitteral(src) {
  const debut = src.search(/\bconst\s+I18N\s*=\s*\{/);
  if (debut < 0) throw new Error('littéral « const I18N = { … } » introuvable');
  const ouvrante = src.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvrante; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {                 // chaîne : on saute jusqu'au guillemet fermant
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {              // commentaire de ligne
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {              // commentaire de bloc
      i = src.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else if (c === '{') {
      profondeur++;
    } else if (c === '}' && --profondeur === 0) {
      return src.slice(ouvrante, i + 1);
    }
  }
  throw new Error('accolade fermante du littéral I18N introuvable');
}

function main() {
  const fichier = process.argv[2] ? path.resolve(process.argv[2]) : FICHIER;
  let i18n;
  try {
    i18n = vm.runInNewContext('(' + extraireLitteral(fs.readFileSync(fichier, 'utf8')) + ')', Object.create(null), { timeout: 2000 });
  } catch (e) {
    console.error(`  i18n : ${path.relative(ROOT, fichier)} illisible (${e.message})`);
    process.exit(1);
  }
  const erreurs = [], avertissements = [];
  const absentes = LANGUES.filter(l => !i18n[l] || typeof i18n[l] !== 'object');
  for (const l of absentes) erreurs.push(`  i18n : langue « ${l} » absente de I18N`);
  const presentes = LANGUES.filter(l => !absentes.includes(l));
  const toutes = new Set(presentes.flatMap(l => Object.keys(i18n[l])));
  for (const l of presentes) {
    const exemptees = new Set(EXEMPTIONS[l] || []);
    const manquantes = [...toutes].filter(k => !(k in i18n[l]));
    const bloquantes = manquantes.filter(k => !exemptees.has(k));
    const tolerees = manquantes.filter(k => exemptees.has(k));
    if (bloquantes.length) erreurs.push(`  i18n : ${l} : ${bloquantes.length} clé(s) manquante(s) : ${bloquantes.join(', ')}`);
    if (tolerees.length) avertissements.push(`  avertissement : i18n ${l} : ${tolerees.length} clé(s) manquante(s) exemptée(s) : ${tolerees.join(', ')}`);
    const obsoletes = [...exemptees].filter(k => !manquantes.includes(k));
    if (obsoletes.length) avertissements.push(`  avertissement : i18n ${l} : exemption(s) obsolète(s), à retirer d'EXEMPTIONS : ${obsoletes.join(', ')}`);
  }
  if (erreurs.length) {
    console.error(erreurs.join('\n'));
    process.exit(1);
  }
  avertissements.forEach(a => console.log(a));
  console.log(`i18n : parité ${presentes.join('/')} (${toutes.size} clés)${avertissements.length ? ', avertissements ci-dessus' : ''}`);
}

main();
