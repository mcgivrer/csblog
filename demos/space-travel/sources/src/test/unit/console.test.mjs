import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './_load.mjs';

/* Console avec les cinq onglets du contrat (nav, missions, port, yard, help) ; vis = états de visible() modifiables */
function setup(){
  const t = load({ ui: ['50-console.js'] });
  const C = t.CONSOLE;
  const vis = { nav: true, missions: true, port: true, yard: true, help: true };
  const log = [];
  const def = (id, order, fkey, keys) => ({
    id, order, fkey, keys, labelKey: 'conTab' + id,
    visible: () => vis[id],
    onShow: p => log.push(['show', id]),
    onHide: r => log.push(['hide', id, r])
  });
  // inscrits dans le désordre pour tester le tri
  C.register(def('help', 90, null, ['KeyH', 'KeyV']));
  C.register(def('port', 40, 'F4', []));
  C.register(def('nav', 20, 'F2', ['KeyM', 'Semicolon']));
  C.register(def('yard', 50, 'F5', []));
  C.register(def('missions', 30, 'F3', ['KeyJ']));
  return { t, C, vis, log };
}
const K = (code, o = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...o });
const OK = { started: true, paused: false, typing: false };

test('la console se charge sans globale parasite', () => {
  const t = load({ ui: ['50-console.js'] });
  assert.equal(typeof t.CONSOLE.register, 'function');
  assert.deepEqual(t.nouvellesGlobales, []);
  assert.equal(load().CONSOLE, undefined);
});

test('inscription : tri par order, doublon refusé', () => {
  const { C } = setup();
  assert.deepEqual(plain(C.tabs().map(x => x.id)), ['nav', 'missions', 'port', 'yard', 'help']);
  assert.throws(() => C.register({ id: 'nav', order: 1 }), { message: 'onglet_double' });
  assert.equal(C.tabs().length, 5);
  assert.equal(C.current(), null);
  assert.equal(C.last(), null);
  assert.equal(C.isOpen(), false);
});

test('visible() : exception = faux, ouverture refusée si invisible', () => {
  const { C, vis, t } = setup();
  C.register({ id: 'x', order: 60, visible: () => { throw new Error('boum'); } });
  assert.deepEqual(plain(C.visibleTabs().map(x => x.id)), ['nav', 'missions', 'port', 'yard', 'help']);
  assert.equal(t.logs.some(l => l[0] === 'error'), true);
  assert.equal(C.open('x'), false);
  vis.port = false;
  assert.equal(C.open('port'), false);
  assert.equal(C.current(), null);
  assert.equal(C.open('inconnu'), false);
  assert.deepEqual(plain(C.visibleTabs().map(x => x.id)), ['nav', 'missions', 'yard', 'help']);
});

test('open() : premier visible, puis dernier onglet visible, repli sur le premier visible', () => {
  const { C, vis, log } = setup();
  assert.equal(C.open(), true);
  assert.equal(C.current(), 'nav');
  C.close();
  assert.equal(C.open('missions'), true);
  C.close();
  assert.equal(C.last(), 'missions');
  assert.equal(C.open(), true);
  assert.equal(C.current(), 'missions');
  C.close();
  vis.missions = false;
  assert.equal(C.open(), true);
  assert.equal(C.current(), 'nav');
  C.close();
  Object.keys(vis).forEach(k => { vis[k] = false; });
  assert.equal(C.open(), false);
  assert.ok(log.length > 0);
});

test('changement d\'onglet : onHide(switch) puis onShow ; fermeture : onHide(raison)', () => {
  const { C, log } = setup();
  C.open('nav');
  C.open('help');
  assert.equal(C.open('help'), true);               // déjà courant : sans effet
  C.close('legacy');
  assert.deepEqual(log, [['show', 'nav'], ['hide', 'nav', 'switch'], ['show', 'help'], ['hide', 'help', 'legacy']]);
  assert.equal(C.close(), false);                   // déjà fermée
});

test('toggle : ouvert sur id ferme, sinon ouvre id', () => {
  const { C } = setup();
  C.toggle('nav');
  assert.equal(C.isOpen('nav'), true);
  C.toggle('missions');
  assert.equal(C.current(), 'missions');
  assert.equal(C.isOpen('nav'), false);
  C.toggle('missions');
  assert.equal(C.isOpen(), false);
  assert.equal(C.last(), 'missions');
});

test('refresh : ferme l\'onglet devenu invisible, renvoie le changement', () => {
  const { C, vis, log } = setup();
  assert.equal(C.refresh(), false);
  C.open('port');
  vis.port = false;
  assert.equal(C.refresh(), true);
  assert.equal(C.current(), null);
  assert.deepEqual(log.at(-1), ['hide', 'port', 'hidden']);
  assert.equal(C.refresh(), false);
  vis.port = true;
  assert.equal(C.refresh(), true);                  // l'ensemble visible a changé
  vis.yard = false;                                  // un onglet non courant disparaît : changement, console intacte
  C.open('nav');
  assert.equal(C.refresh(), true);
  assert.equal(C.current(), 'nav');
});

test('badges : pose, retrait, événement', () => {
  const { C } = setup();
  const evts = [];
  C.on('badge', e => evts.push(plain(e)));
  C.badge('missions', 3);
  C.badge('missions', 3);                           // inchangé : pas d'événement
  C.badge('port', 1);
  assert.deepEqual(plain(C.badges()), { missions: 3, port: 1 });
  C.badge('missions', null);
  C.badge('missions', null);
  C.badge('port', 0);
  assert.deepEqual(plain(C.badges()), {});
  assert.deepEqual(evts, [{ id: 'missions', n: 3 }, { id: 'port', n: 1 }, { id: 'missions', n: null }, { id: 'port', n: null }]);
  C.badges().x = 9;                                  // copie : sans effet
  assert.deepEqual(plain(C.badges()), {});
});

test('événements open / tab / close / tabs et désabonnement', () => {
  const { C, vis } = setup();
  const ev = [];
  const offs = ['open', 'tab', 'close', 'tabs'].map(n => C.on(n, e => ev.push([n, plain(e)])));
  C.open('nav');
  C.open('help');
  C.close('user');
  vis.port = false;
  C.refresh();
  assert.deepEqual(ev, [
    ['open', { id: 'nav' }],
    ['tab', { from: 'nav', to: 'help' }],
    ['close', { id: 'help', reason: 'user' }],
    ['tabs', { ids: ['nav', 'missions', 'yard', 'help'] }]
  ]);
  offs.forEach(f => f());
  offs.forEach(f => f());                            // idempotent
  C.open('nav');
  assert.equal(ev.length, 4);
  assert.throws(() => C.on('open', 42), { message: 'ecouteur_invalide' });
});

test('erreur d\'écouteur : journalisée, jamais propagée, les autres écouteurs sont appelés', () => {
  const { C, t } = setup();
  let vu = 0;
  C.on('open', () => { throw new Error('mauvais écouteur'); });
  C.on('open', () => { vu++; });
  assert.doesNotThrow(() => C.open('nav'));
  assert.equal(vu, 1);
  assert.equal(C.current(), 'nav');
  assert.equal(t.logs.some(l => l[0] === 'error'), true);
});

test('erreur de onShow / onHide : journalisée, jamais propagée', () => {
  const t = load({ ui: ['50-console.js'] });
  const C = t.CONSOLE;
  C.register({ id: 'a', order: 1, onShow(){ throw new Error('s'); }, onHide(){ throw new Error('h'); } });
  assert.doesNotThrow(() => { C.open('a'); C.close(); });
  assert.equal(C.current(), null);
  assert.equal(t.logs.filter(l => l[0] === 'error').length, 2);
});

test('_reset remet la console à zéro', () => {
  const { C } = setup();
  C.open('nav'); C.badge('nav', 2);
  C._reset();
  assert.deepEqual([C.tabs().length, C.current(), C.last(), C.isOpen()], [0, null, null, false]);
  assert.deepEqual(plain(C.badges()), {});
});

/* ---- keyAction ---------------------------------------------------------- */
test('keyAction : rien si !started, paused ou typing', () => {
  const { C } = setup();
  for(const code of ['Tab', 'Escape', 'F2', 'KeyM', 'Digit3', 'Space'])
    for(const ctx of [{ ...OK, started: false }, { ...OK, paused: true }, { ...OK, typing: true }])
      assert.equal(C.keyAction(K(code, { altKey: code === 'Digit3' }), ctx), null, code);
  C.open('nav');
  assert.equal(C.keyAction(K('KeyX'), { ...OK, paused: true }), null);
});

test('keyAction console fermée : Tab, Échap, F1–F8, Alt+n, lettres, Espace/Entrée', () => {
  const { C } = setup();
  const a = (code, o) => plain(C.keyAction(K(code, o), OK));
  assert.deepEqual(a('Tab'), { act: 'last' });
  assert.equal(a('Escape'), null);                   // la pause garde Échap
  assert.deepEqual(a('F2'), { act: 'toggle', tab: 'nav' });
  assert.deepEqual(a('F3'), { act: 'toggle', tab: 'missions' });
  assert.deepEqual(a('F4'), { act: 'toggle', tab: 'port' });
  assert.deepEqual(a('F5'), { act: 'toggle', tab: 'yard' });
  for(const f of ['F1', 'F6', 'F7', 'F8']) assert.deepEqual(a(f), { act: 'reserved' }, f);
  for(const f of ['F9', 'F10', 'KeyP', 'Pause', 'KeyL', 'KeyI', 'KeyT', 'KeyG']) assert.equal(a(f), null, f);
  for(let n = 1; n <= 8; n++) assert.deepEqual(a('Digit' + n, { altKey: true }), { act: 'hud', index: n - 1 });
  assert.deepEqual(a('Digit3', { altKey: true }), { act: 'hud', index: 2 });
  assert.equal(a('Digit3'), null);                   // sans Alt : non traité
  assert.equal(a('Digit9', { altKey: true }), null);
  assert.equal(a('KeyM', { altKey: true }), null);
  assert.deepEqual(a('KeyM'), { act: 'toggle', tab: 'nav' });
  assert.deepEqual(a('Semicolon'), { act: 'toggle', tab: 'nav' });
  assert.deepEqual(a('KeyJ'), { act: 'toggle', tab: 'missions' });
  assert.deepEqual(a('KeyH'), { act: 'toggle', tab: 'help' });
  assert.deepEqual(a('KeyV'), { act: 'toggle', tab: 'help' });
  assert.equal(a('Space'), null);
  assert.equal(a('Enter'), null);
  assert.equal(a('Tab', { repeat: true }), null);
  assert.equal(a('KeyR', { ctrlKey: true }), null);
  assert.equal(a('F5', { metaKey: true }), null);
});

test('keyAction console ouverte : fermeture, avalement, exceptions', () => {
  const { C } = setup();
  const a = (code, o) => plain(C.keyAction(K(code, o), OK));
  C.open('missions');
  assert.deepEqual(a('Tab'), { act: 'close' });
  assert.deepEqual(a('Escape'), { act: 'close' });
  assert.deepEqual(a('F4'), { act: 'toggle', tab: 'port' });
  assert.deepEqual(a('F1'), { act: 'reserved' });
  assert.deepEqual(a('KeyJ'), { act: 'toggle', tab: 'missions' });
  assert.deepEqual(a('KeyH'), { act: 'toggle', tab: 'help' });
  assert.deepEqual(a('Digit1', { altKey: true }), { act: 'hud', index: 0 });
  assert.deepEqual(a('Space'), { act: 'swallow' });
  assert.deepEqual(a('Enter'), { act: 'swallow' });
  assert.deepEqual(a('KeyW'), { act: 'swallow' });
  assert.deepEqual(a('ArrowUp'), { act: 'swallow' });
  assert.deepEqual(a('Tab', { repeat: true }), { act: 'swallow' });
  assert.deepEqual(a('KeyL', { altKey: true }), { act: 'swallow' });
  for(const code of ['KeyP', 'Pause', 'F9', 'F10']) assert.equal(a(code), null, code);
  C.open('nav');
  assert.deepEqual(a('Space'), { act: 'close' });    // Navigation : parité avec la carte
  assert.deepEqual(a('Enter'), { act: 'close' });
  assert.deepEqual(a('NumpadEnter'), { act: 'close' });
  assert.deepEqual(a('KeyM'), { act: 'toggle', tab: 'nav' });
});
