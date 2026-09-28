/* =========================================================================
   1. PRNG SEEDÉ — tout l'univers découle d'une seule graine
   ========================================================================= */
function xmur3(str){
  let h = 1779033703 ^ str.length;
  for(let i=0;i<str.length;i++){
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h<<13) | (h>>>19);
  }
  return function(){
    h = Math.imul(h ^ (h>>>16), 2246822507);
    h = Math.imul(h ^ (h>>>13), 3266489909);
    h ^= h>>>16;
    return h>>>0;
  };
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a>>>15), 1 | a);
    t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}
function rngFor(tag){ return mulberry32(xmur3(tag)()); }

/* ?seed=XXXX dans l'URL : univers reproductible (tests automatisés, débogage, partage d'une partie) */
const SEED = new URLSearchParams(location.search).get('seed') || Date.now().toString(36).toUpperCase() + '-' +
  Math.floor(Math.random()*46656).toString(36).toUpperCase().padStart(3,'0');
document.getElementById('seedVal').textContent = SEED;
