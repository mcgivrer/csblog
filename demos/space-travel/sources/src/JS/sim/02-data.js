/* =========================================================================
   CAMPAGNE 3. DONNÉES — DATA : tables embarquées au build dans <script type="application/json" id="sttData">
   Objet { nom_sans_extension: contenu } (un fichier de src/data/ par entrée), lu une seule fois puis mis en cache.
   ========================================================================= */
/* @provides DATA */
const DATA = (function(){
  let cache = null;

  function lire(){
    if(cache) return cache;
    let obj = {};
    try{
      const el = (typeof document !== 'undefined') ? document.getElementById('sttData') : null;
      const txt = el && el.textContent;
      const j = txt ? JSON.parse(txt) : null;
      if(j && typeof j === 'object' && !Array.isArray(j)) obj = j;
    }catch(e){
      if(typeof console !== 'undefined') console.error('[DATA] sttData illisible :', e);
    }
    cache = obj;
    return cache;
  }

  /* Table demandée, ou {} si absente */
  function get(nom){
    const all = lire();
    const v = Object.prototype.hasOwnProperty.call(all, nom) ? all[nom] : null;
    return (v && typeof v === 'object') ? v : {};
  }

  function all(){ return lire(); }

  /* Tests : remplace le cache ; sans argument, force une nouvelle lecture du DOM */
  function _set(obj){ cache = (obj && typeof obj === 'object') ? obj : null; }

  return { get: get, all: all, _set: _set };
})();
