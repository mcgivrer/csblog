/* Chargeur des tests unitaires de la couche sim/ : reproduit le build (scripts classiques, portée globale commune,
   « use strict » en tête) dans un contexte vm avec bouchons (location, document, stockage en mémoire).
   Usage : const t = load({ search: '?seed=ABC' }); t.GAME, t.RNG, t.DATA, t.SAVE, t.JOURNAL, t.SEED, t.xmur3, t.mulberry32 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const JS_DIR = path.resolve(ICI, '../../JS');
export const SIM_DIR = path.join(JS_DIR, 'sim');
export const UI_DIR = path.join(JS_DIR, 'ui');
export const PRNG_FILE = path.join(JS_DIR, 'game', '02-prng-seede-tout-l.js');
export const ECONOMY_FILE = path.resolve(ICI, '../../data/economy.json');

export function simFiles(){
  return fs.readdirSync(SIM_DIR).filter(f => f.endsWith('.js')).sort().map(f => path.join(SIM_DIR, f));
}

/* Normalise un objet issu du contexte vm (autre realm) pour deepStrictEqual */
export const plain = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/* Stockage en mémoire (API localStorage) */
export function memoryStorage(){
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    keys: () => [...m.keys()]
  };
}

/* opts : search ('' par défaut), data (contenu de #sttData), document (membres ajoutés au bouchon),
          setup(sandbox) avant création du contexte, headless (retire document et localStorage après le PRNG),
          concat (un seul script, comme le build),
          ui (fichiers de src/JS/ui/ chargés après sim/, ex. ['50-console.js'] ; t.CONSOLE si présent) */
export function load(opts = {}){
  const logs = [];
  const localStorage = memoryStorage();
  const elements = {};
  if(opts.data !== undefined) elements.sttData = { textContent: JSON.stringify(opts.data) };
  const timers = [];
  const sandbox = {
    location: { search: opts.search ?? '' },
    URLSearchParams,
    localStorage,
    document: Object.assign({
      getElementById: id => (elements[id] ||= { textContent: '' })
    }, opts.document),
    console: {
      error: (...a) => logs.push(['error', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
      log: (...a) => logs.push(['log', ...a])
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }
  };
  if(opts.setup) opts.setup(sandbox);
  const ctx = vm.createContext(sandbox);

  const exec = (file, src) => vm.runInContext('"use strict";\n' + src, ctx, { filename: file, lineOffset: -1 });
  const lire = f => fs.readFileSync(f, 'utf8');
  const avant = new Set(Object.getOwnPropertyNames(ctx));
  exec(PRNG_FILE, lire(PRNG_FILE));
  const apresPrng = new Set(Object.getOwnPropertyNames(ctx));
  if(opts.headless){ delete ctx.document; delete ctx.localStorage; }
  const sims = simFiles();
  if(opts.concat) exec('sim-concat.js', sims.map(lire).join('\n'));
  else sims.forEach(f => exec(f, lire(f)));
  (opts.ui || []).forEach(n => { const f = path.join(UI_DIR, n); exec(f, lire(f)); });
  const apresSim = Object.getOwnPropertyNames(ctx);

  const get = nom => vm.runInContext(nom, ctx);
  return {
    ctx, logs, timers, elements, localStorage, plain,
    run: code => vm.runInContext(code, ctx),
    GAME: get('GAME'), RNG: get('RNG'), DATA: get('DATA'), SAVE: get('SAVE'), JOURNAL: get('JOURNAL'),
    SEED: get('SEED'), CONSOLE: (opts.ui || []).includes('50-console.js') ? get('CONSOLE') : undefined, xmur3: get('xmur3'), mulberry32: get('mulberry32'),
    /* propriétés globales ajoutées par les fichiers sim/ (doit rester vide : les consts ne sont pas des propriétés) */
    nouvellesGlobales: apresSim.filter(n => !apresPrng.has(n) && !(opts.headless && (n === 'document' || n === 'localStorage'))),
    globalesPrng: [...apresPrng].filter(n => !avant.has(n))
  };
}
