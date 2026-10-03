/* =========================================================================
   SCÈNES — gestionnaire (lot 1 du plan docs/PLAN-scenes.md)
   Une scène est un MODE d'interaction et d'affichage du jeu (titre, vol, orbite, pause…).
   Le gestionnaire tient une pile : une scène de base (type 'base', index 0) et des scènes modales
   (type 'modal') empilées au-dessus. Il ne dépend ni du DOM ni de three.js.

   Lot 1 : le gestionnaire OBSERVE le jeu. À chaque image, scenes-jeu.js déduit la pile voulue des
   drapeaux existants (gameStarted, gamePaused, jumpState, REAL.phase…) et la passe à sync(), qui
   émet les événements enter/exit et vérifie la table des transitions. Les drapeaux restent la
   source de vérité ; chaque scène en prendra la charge aux lots suivants.
   Nommage : `scene` (minuscule) est déjà le THREE.Scene du moteur ; le concept s'appelle donc
   « scène de jeu » et le gestionnaire SCENES.
   ========================================================================= */
const SCENES = (function(){
  const defs = Object.create(null);          /* nom -> définition de scène */
  let stack = [];                            /* noms ; la scène de base est en 0 */
  let rules = { allow: null, over: null };   /* table des transitions de base ; scènes sur lesquelles une modale peut s'empiler */
  const listeners = { enter: [], exit: [] };
  const violations = [];                     /* écarts constatés entre la pile observée et la table des transitions */
  const log = [];                            /* historique borné des changements de pile */
  const MAX_VIOLATIONS = 50, MAX_LOG = 200;
  let seq = 0;

  function register(scene){
    if(!scene || typeof scene.name !== 'string' || !scene.name) throw new TypeError('scène sans nom');
    if(scene.type !== 'base' && scene.type !== 'modal') throw new TypeError('type de scène invalide : ' + scene.name);
    if(defs[scene.name]) throw new Error('scène déjà enregistrée : ' + scene.name);
    defs[scene.name] = Object.assign({
      freezesBelow: false,                   /* vrai : les scènes dessous ne reçoivent plus update() */
      rendersBelow: true,                    /* faux : les scènes dessous ne sont plus dessinées */
      ui: [],                                /* panneaux affichés par la scène (lot 4) */
      enter: function(){}, exit: function(){}, update: function(){}
    }, scene);
  }

  /* allow : { '': ['boot'], boot: ['title'], … } — transitions permises de la scène de base (clé '' : démarrage)
     over  : { pause: ['flight', …], … } — scènes sous lesquelles une modale peut apparaître */
  function configure(r){ rules = { allow: r.allow || null, over: r.over || null }; }

  function on(kind, fn){
    if(!listeners[kind]) throw new TypeError('événement inconnu : ' + kind);
    listeners[kind].push(fn);
  }
  function emit(kind, name){
    for(let i = 0; i < listeners[kind].length; i++) listeners[kind][i](name);
  }
  function same(a, b){
    if(a.length !== b.length) return false;
    for(let i = 0; i < a.length; i++) if(a[i] !== b[i]) return false;
    return true;
  }
  function violate(from, to, reason){
    if(violations.length < MAX_VIOLATIONS) violations.push({ from: from.slice(), to: to.slice(), reason: reason });
  }

  function validate(from, to, common){
    const prev = from.length ? from[0] : '';
    if(rules.allow && prev !== to[0]){
      const ok = rules.allow[prev] && rules.allow[prev].indexOf(to[0]) >= 0;
      if(!ok) violate(from, to, 'transition de base interdite : ' + (prev || '(départ)') + ' -> ' + to[0]);
    }
    if(rules.over){
      for(let i = common; i < to.length - 1; i++){
        const name = to[i + 1], below = to[i];
        const ok = rules.over[name] && rules.over[name].indexOf(below) >= 0;
        if(!ok) violate(from, to, 'modale ' + name + ' interdite au-dessus de ' + below);
      }
    }
  }

  /* desired : noms, la scène de base d'abord. Retourne vrai si la pile a changé. */
  function sync(desired){
    if(same(desired, stack)) return false;
    if(!desired.length || defs[desired[0]] === undefined || defs[desired[0]].type !== 'base') throw new TypeError('la première scène doit être une scène de base');
    for(let i = 0; i < desired.length; i++) if(!defs[desired[i]]) throw new TypeError('scène inconnue : ' + desired[i]);
    const from = stack.slice(), to = desired.slice();
    let common = 0;                                       /* modales conservées */
    while(common < from.length - 1 && common < to.length - 1 && from[common + 1] === to[common + 1]) common++;
    validate(from, to, common);
    for(let i = from.length - 1; i > common; i--){ defs[from[i]].exit(); emit('exit', from[i]); }
    if(!from.length || from[0] !== to[0]){
      if(from.length){ defs[from[0]].exit(); emit('exit', from[0]); }
      defs[to[0]].enter(); emit('enter', to[0]);
    }
    for(let i = common + 1; i < to.length; i++){ defs[to[i]].enter(); emit('enter', to[i]); }
    stack = to;
    log.push({ n: ++seq, from: from, to: to.slice() });
    if(log.length > MAX_LOG) log.shift();
    return true;
  }

  /* du haut vers le bas, tant que la scène du dessus ne gèle pas celles du dessous */
  function update(dt, elapsed){
    for(let i = stack.length - 1; i >= 0; i--){
      const s = defs[stack[i]];
      s.update(dt, elapsed);
      if(s.freezesBelow) break;
    }
  }

  return {
    register: register, configure: configure, on: on, sync: sync, update: update,
    stack: function(){ return stack.slice(); },
    base: function(){ return stack.length ? stack[0] : null; },
    current: function(){ return stack.length ? stack[stack.length - 1] : null; },
    has: function(name){ return stack.indexOf(name) >= 0; },
    names: function(){ return Object.keys(defs); },
    get: function(name){ return defs[name]; },
    violations: violations,
    history: function(){ return log.slice(); }
  };
})();
