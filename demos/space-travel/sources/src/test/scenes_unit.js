/* Tests unitaires du gestionnaire de scènes (src/JS/scenes/scene.js), sans navigateur ni jeu.
   Lancé par scenes_unit_test.py ; sortie : lignes PASS / FAIL, code retour non nul au moindre échec. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'JS', 'scenes', 'scene.js'), 'utf8');
let fails = 0;
function check(name, ok, info){ console.log((ok ? '    PASS ' : '    FAIL ') + name + (info !== undefined ? '  — ' + info : '')); if(!ok) fails++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fresh = () => vm.runInNewContext(src + '\n;SCENES');
function jeu(S){                                   /* mêmes scènes et mêmes règles que scenes-jeu.js */
  ['boot', 'title', 'flight', 'orbit', 'jump'].forEach(n => S.register({ name: n, type: 'base' }));
  ['shipSelect', 'flyover', 'starMap'].forEach(n => S.register({ name: n, type: 'modal' }));
  S.register({ name: 'pause', type: 'modal', freezesBelow: true });
  S.configure({
    allow: { '': ['boot'], boot: ['title'], title: ['flight'], flight: ['orbit', 'jump'], orbit: ['flight'], jump: ['flight'] },
    over: { shipSelect: ['title'], flyover: ['flight', 'orbit'], starMap: ['flight', 'orbit', 'jump', 'flyover'], pause: ['flight', 'orbit', 'jump', 'flyover'] }
  });
  return S;
}
function throws(fn){ try { fn(); } catch(e){ return true; } return false; }

/* enregistrement */
let S = fresh();
check('scène sans nom refusée', throws(() => S.register({ type: 'base' })));
check('type invalide refusé', throws(() => S.register({ name: 'x', type: 'autre' })));
S.register({ name: 'a', type: 'base' });
check('doublon refusé', throws(() => S.register({ name: 'a', type: 'base' })));
check('scène connue', eq(S.names(), ['a']));

/* synchronisation et événements */
S = jeu(fresh()); const ev = [];
S.on('enter', n => ev.push('+' + n)); S.on('exit', n => ev.push('-' + n));
check('pile vide au départ', eq(S.stack(), []) && S.base() === null && S.current() === null);
check('première synchronisation : boot', S.sync(['boot']) === true && eq(S.stack(), ['boot']) && eq(ev, ['+boot']));
check('synchronisation identique : aucun événement', S.sync(['boot']) === false && ev.length === 1);
S.sync(['title']); S.sync(['flight']);
check('changement de base : sortie puis entrée', eq(ev, ['+boot', '-boot', '+title', '-title', '+flight']), ev.join(' '));
ev.length = 0; S.sync(['flight', 'pause']);
check('modale empilée : entrée seule', eq(ev, ['+pause']) && S.current() === 'pause' && S.base() === 'flight' && S.has('pause'));
ev.length = 0; S.sync(['flight']);
check('modale retirée : sortie seule', eq(ev, ['-pause']) && S.current() === 'flight');
S.sync(['flight', 'starMap']); ev.length = 0; S.sync(['orbit', 'starMap']);
check('modale conservée quand la base change', eq(ev, ['-flight', '+orbit']) && eq(S.stack(), ['orbit', 'starMap']), ev.join(' '));
S.sync(['orbit']); S.sync(['orbit', 'flyover', 'pause']); ev.length = 0; S.sync(['orbit']);
check('plusieurs modales retirées : sortie par le haut', eq(ev, ['-pause', '-flyover']), ev.join(' '));
check('scène inconnue refusée', throws(() => S.sync(['flight', 'inconnue'])));
check('la première scène doit être de base', throws(() => S.sync(['pause'])));
check('pile inchangée après un refus', eq(S.stack(), ['orbit']));
check('événement inconnu refusé', throws(() => S.on('autre', () => {})));

/* table des transitions : observée, signalée, jamais bloquante */
S = jeu(fresh());
S.sync(['boot']); S.sync(['title']); S.sync(['flight']); S.sync(['orbit']); S.sync(['flight']); S.sync(['jump']); S.sync(['flight']);
S.sync(['flight', 'flyover', 'pause']); S.sync(['flight']); S.sync(['flight', 'starMap']);
check('parcours conforme : aucune violation', S.violations.length === 0, JSON.stringify(S.violations));
S = jeu(fresh()); S.sync(['boot']); S.sync(['flight']);
check('transition de base interdite signalée', S.violations.length === 1 && /boot -> flight/.test(S.violations[0].reason), S.violations[0] && S.violations[0].reason);
check('transition interdite appliquée quand même (observateur)', S.base() === 'flight');
S = jeu(fresh()); S.sync(['boot']); S.sync(['title']); S.sync(['title', 'pause']);
check('modale au-dessus d\'une base interdite signalée', S.violations.length === 1 && /pause interdite au-dessus de title/.test(S.violations[0].reason), S.violations[0] && S.violations[0].reason);
S = jeu(fresh()); S.sync(['flight']);
check('démarrage ailleurs que boot signalé', S.violations.length === 1 && /\(départ\)/.test(S.violations[0].reason));
S = jeu(fresh()); S.sync(['boot']); S.sync(['title']); S.sync(['flight']);
for(let i = 0; i < 80; i++){ S.sync(['flight', 'starMap']); S.sync(['flight', 'pause', 'starMap']); }
check('violations bornées', S.violations.length <= 50, S.violations.length);
S = jeu(fresh()); S.sync(['boot']);
check('historique des changements', S.history().length === 1 && eq(S.history()[0].to, ['boot']));
for(let i = 0; i < 300; i++){ S.sync(['title']); S.sync(['boot']); }
check('historique borné', S.history().length <= 200, S.history().length);

/* mise à jour : du haut vers le bas, la pause gèle ce qui est dessous */
const calls = [];
S = fresh();
S.register({ name: 'b', type: 'base', update: () => calls.push('b') });
S.register({ name: 'm', type: 'modal', update: () => calls.push('m') });
S.register({ name: 'p', type: 'modal', freezesBelow: true, update: () => calls.push('p') });
S.sync(['b', 'm']); S.update(.1, 1);
check('modale non gelante : tout est mis à jour, du haut vers le bas', eq(calls, ['m', 'b']), calls.join(' '));
calls.length = 0; S.sync(['b', 'm', 'p']); S.update(.1, 1);
check('modale gelante : les scènes dessous ne sont pas mises à jour', eq(calls, ['p']), calls.join(' '));
calls.length = 0; S.sync(['b']); S.update(.1, 1);
check('base seule mise à jour', eq(calls, ['b']));

console.log(fails ? '  ' + fails + ' échec(s)' : '  tous les tests du gestionnaire passent');
process.exit(fails ? 1 : 0);
