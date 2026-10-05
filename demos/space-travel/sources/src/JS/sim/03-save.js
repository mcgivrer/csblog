/* =========================================================================
   CAMPAGNE 4. SAUVEGARDE — SAVE : sérialisation versionnée, stockage local, export / import de fichier
   Format = l'état GAME en JSON. Migrations par version (MIGRATIONS[v] : état v -> état v+1, vide pour l'instant).
   Seul exportFile touche le DOM, gardé par typeof document ; tout accès au stockage est dans un try/catch.
   ========================================================================= */
/* @provides SAVE @requires GAME */
const SAVE = (function(){
  const KEYS = { auto: 'stt.campaign.v1.auto', slots: ['stt.campaign.v1.slot1', 'stt.campaign.v1.slot2', 'stt.campaign.v1.slot3'] };
  const MIGRATIONS = {};     // MIGRATIONS[v] = s => s' (le décompte de version est tenu par parse)
  let storage = null;        // surcharge de test (setStorage) ; sinon localStorage

  function stockage(){
    if(storage) return storage;
    try{ return (typeof localStorage !== 'undefined') ? localStorage : null; }catch(e){ return null; }
  }

  function serialize(state){
    if(!state || typeof state !== 'object') throw new Error('save_invalide');
    return JSON.stringify(state);
  }

  /* chaîne -> état : save_newer si la version est postérieure au jeu, save_invalide si JSON ou contenu incorrect */
  function parse(str){
    let s;
    try{ s = JSON.parse(str); }catch(e){ throw new Error('save_invalide'); }
    if(!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('save_invalide');
    let v = s.v;
    if(typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('save_invalide');
    if(v > api.VERSION) throw new Error('save_newer');
    if(s.mode !== 'campaign') throw new Error('save_invalide');
    while(v < api.VERSION){
      const m = MIGRATIONS[v];
      if(typeof m !== 'function') throw new Error('save_invalide');
      s = m(s);
      if(!s || typeof s !== 'object') throw new Error('save_invalide');
      s.v = ++v;
    }
    return s;
  }

  /* écrit GAME.state ; false si pas de campagne, pas de stockage ou stockage refusé (quota, mode privé) */
  function write(key){
    const st = GAME.state;
    if(!st) return false;
    try{
      const s = stockage();
      if(!s) return false;
      s.setItem(key || KEYS.auto, serialize(st));
      return true;
    }catch(e){ return false; }
  }

  /* état ou null (absent, illisible, trop récent) */
  function read(key){
    try{
      const s = stockage();
      const txt = s ? s.getItem(key || KEYS.auto) : null;
      return txt == null ? null : parse(txt);
    }catch(e){ return null; }
  }

  /* présence d'une sauvegarde (sans la valider : read() dira si elle est exploitable) */
  function has(key){
    try{
      const s = stockage();
      return !!s && s.getItem(key || KEYS.auto) != null;
    }catch(e){ return false; }
  }

  /* Tests : { getItem, setItem } à la place de localStorage ; null = retour à localStorage */
  function setStorage(obj){ storage = obj || null; }

  /* télécharge stt-campagne-<seed>.stt-save.json ; false hors navigateur ou sans campagne */
  function exportFile(){
    const st = GAME.state;
    if(!st || typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    const url = URL.createObjectURL(new Blob([serialize(st)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stt-campagne-' + String(st.seed).replace(/[^A-Za-z0-9._-]+/g, '_') + '.stt-save.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  /* texte d'un fichier de sauvegarde -> GAME.load ; les erreurs de parse() remontent, l'état courant reste intact */
  function importText(str){
    return GAME.load(parse(str));
  }

  const api = {
    VERSION: 1, KEYS: KEYS, MIGRATIONS: MIGRATIONS,
    serialize: serialize, parse: parse,
    write: write, read: read, has: has, setStorage: setStorage,
    exportFile: exportFile, importText: importText
  };
  return api;
})();
