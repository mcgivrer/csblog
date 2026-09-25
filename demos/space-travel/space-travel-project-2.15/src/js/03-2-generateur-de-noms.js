/* =========================================================================
   2. GÉNÉRATEUR DE NOMS — mélange de racines grecques, latines, hindi,
      chinoises, françaises, anglaises, russes, espagnoles, portugaises
   ========================================================================= */
const LANG_BANKS = {
  grec:      ['thal','xan','ory','phe','kass','iot','nyx','ther','poly','aster','dora','krys','helio','sel'],
  latin:     ['sol','lux','via','nova','terra','ignis','stel','magna','fer','rex','aqua','umbra','ventus','ferox'],
  hindi:     ['chandra','tara','veer','anant','surya','maya','indra','shakti','deva','loka','ratna','megha'],
  chinois:   ['xing','tian','long','yun','hai','feng','jing','ming','hua','shan','lan','yue'],
  francais:  ['etoile','ombre','lune','ciel','feu','vent','noir','clair','riviere','songe','brume','aube'],
  anglais:   ['star','drift','shadow','edge','far','deep','light','wander','void','dawn','frost','ash'],
  russe:     ['zvezda','nebo','ogon','burya','tumana','svet','krasny','volna','strannik','zima'],
  espagnol:  ['estrella','sombra','fuego','cielo','luna','viento','lejano','claro','niebla','alba'],
  portugais: ['estrela','nevoa','fogo','ceu','lua','vento','distante','bruma','aurora']
};
const LANG_KEYS = Object.keys(LANG_BANKS);
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
/* désignation orbitale à la manière des exoplanètes (b, c, d…) : ici en
   chiffres romains, convention plus lisible pour un nom de planète isolé */
const ROMAN_NUMERALS = ['I','II','III','IV','V','VI','VII','VIII'];
function toRoman(n){ return ROMAN_NUMERALS[n-1] || String(n); }
function generateName(rng){
  const l1 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)];
  let l2 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)];
  let guard = 0;
  while(l2 === l1 && guard < 5){ l2 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)]; guard++; }
  const bank1 = LANG_BANKS[l1], bank2 = LANG_BANKS[l2];
  const part1 = cap(bank1[Math.floor(rng()*bank1.length)]);
  const part2 = bank2[Math.floor(rng()*bank2.length)];
  const joiner = rng() < 0.45 ? '-' : ' ';
  let name = part1 + joiner + cap(part2);
  if(rng() < 0.55){ name += ' ' + Math.floor(rng()*899+100); }
  return name;
}

