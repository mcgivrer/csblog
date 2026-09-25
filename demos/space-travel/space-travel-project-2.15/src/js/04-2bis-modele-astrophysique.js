/* =========================================================================
   2bis. MODÈLE ASTROPHYSIQUE
   Chaque étoile est tirée d'une population stellaire réaliste puis toutes
   ses grandeurs observables en découlent par les lois de l'astrophysique.
   ========================================================================= */

/* --- Classes spectrales de la séquence principale, avec les fractions
   réellement observées dans le voisinage solaire (les naines M dominent
   très largement ; les O sont quasi introuvables). --- */
const SPECTRAL_CLASSES = [
  /* classe, fraction, masse min/max (M☉), T min/max (K) */
  {cls:'M', frac:0.7645,  mMin:0.08, mMax:0.45, tMin:2400,  tMax:3700},
  {cls:'K', frac:0.1210,  mMin:0.45, mMax:0.80, tMin:3700,  tMax:5200},
  {cls:'G', frac:0.0760,  mMin:0.80, mMax:1.04, tMin:5200,  tMax:6000},
  {cls:'F', frac:0.0300,  mMin:1.04, mMax:1.40, tMin:6000,  tMax:7500},
  {cls:'A', frac:0.0060,  mMin:1.40, mMax:2.10, tMin:7500,  tMax:10000},
  {cls:'B', frac:0.0013,  mMin:2.10, mMax:16.0, tMin:10000, tMax:30000},
  {cls:'O', frac:0.00003, mMin:16.0, mMax:60.0, tMin:30000, tMax:45000}
];

/* Classes de luminosité (Yerkes). La séquence principale domine, mais on
   garde une minorité de géantes, supergéantes et naines blanches. */
const LUMINOSITY_CLASSES = [
  {code:'V',   label:'naine (séquence principale)', frac:0.880},
  {code:'IV',  label:'sous-géante',                 frac:0.030},
  {code:'III', label:'géante',                      frac:0.045},
  {code:'I',   label:'supergéante',                 frac:0.003},
  {code:'D',   label:'naine blanche',               frac:0.042}
];

const T_SUN = 5772;          // température effective du Soleil (K)
const MBOL_SUN = 4.74;       // magnitude bolométrique absolue du Soleil

function pickWeighted(rng, table){
  let total = 0;
  for(const e of table) total += e.frac;
  let r = rng()*total;
  for(const e of table){ r -= e.frac; if(r <= 0) return e; }
  return table[table.length-1];
}

/* --- Loi de Planck → chromaticité CIE → sRGB linéaire.
   Approximation analytique du lieu planckien (valide ~1700–25000 K),
   c'est ainsi qu'on obtient la vraie couleur d'un corps noir. --- */
function blackbodyRGB(T){
  const t = Math.max(1700, Math.min(40000, T));
  let x;
  if(t <= 4000){
    x = -0.2661239e9/(t*t*t) - 0.2343589e6/(t*t) + 0.8776956e3/t + 0.179910;
  } else {
    x = -3.0258469e9/(t*t*t) + 2.1070379e6/(t*t) + 0.2226347e3/t + 0.240390;
  }
  let y;
  if(t <= 2222){
    y = -1.1063814*x*x*x - 1.34811020*x*x + 2.18555832*x - 0.20219683;
  } else if(t <= 4000){
    y = -0.9549476*x*x*x - 1.37418593*x*x + 2.09137015*x - 0.16748867;
  } else {
    y =  3.0817580*x*x*x - 5.87338670*x*x + 3.75112997*x - 0.37001483;
  }
  /* xyY (Y=1) → XYZ */
  const X = x/y, Y = 1.0, Z = (1-x-y)/y;
  /* XYZ → sRGB linéaire (matrice sRGB D65) */
  let r =  3.2406*X - 1.5372*Y - 0.4986*Z;
  let g = -0.9689*X + 1.8758*Y + 0.0415*Z;
  let b =  0.0557*X - 0.2040*Y + 1.0570*Z;
  /* on normalise sur le canal le plus fort : on conserve la TEINTE,
     l'intensité étant portée séparément par la luminosité */
  const max = Math.max(r,g,b,1e-6);
  r = Math.max(0, r/max); g = Math.max(0, g/max); b = Math.max(0, b/max);
  return {r:r, g:g, b:b};
}

/* --- Relation masse-luminosité (séquence principale), par domaines --- */
function luminosityFromMass(M){
  if(M < 0.43)  return 0.23 * Math.pow(M, 2.3);
  if(M < 2.0)   return Math.pow(M, 4.0);
  if(M < 55.0)  return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}

/* --- Loi de Stefan-Boltzmann : L = 4πR²σT⁴, donc R/R☉ dérive de L et T --- */
function radiusFromLT(L, T){
  return Math.sqrt(L) * Math.pow(T_SUN/T, 2);
}

/* --- Magnitude apparente : loi en carré inverse via le module de distance
   m = M_bol + 5·log10(d/10pc) --- */
function apparentMagnitude(L, distPc){
  const Mbol = MBOL_SUN - 2.5*Math.log10(Math.max(L, 1e-8));
  const d = Math.max(distPc, 1e-4);
  return Mbol + 5*Math.log10(d/10);
}

/* --- Génère une étoile physiquement cohérente à partir du PRNG seedé --- */
function generateStar(rng){
  const sc = pickWeighted(rng, SPECTRAL_CLASSES);
  const lc = pickWeighted(rng, LUMINOSITY_CLASSES);

  /* Fonction de masse initiale de Salpeter (dN/dM ∝ M^-2.35) échantillonnée
     par transformation inverse à l'intérieur du domaine de la classe. */
  const alpha = 2.35;
  const a = Math.pow(sc.mMin, 1-alpha), b = Math.pow(sc.mMax, 1-alpha);
  let mass = Math.pow(a + rng()*(b-a), 1/(1-alpha));

  /* Sous-classe 0–9 : position dans le domaine de température (0 = plus chaud) */
  const tFrac = rng();
  let temp = sc.tMax - tFrac*(sc.tMax - sc.tMin);
  const sub = Math.min(9, Math.floor(tFrac*10));

  let lum = luminosityFromMass(mass);

  /* Les classes évoluées s'écartent de la séquence principale : une géante a
     quitté la fusion de l'hydrogène en cœur, s'est dilatée et refroidie. */
  if(lc.code === 'IV'){ lum *= 2.5 + rng()*3; }
  else if(lc.code === 'III'){ lum *= 25 + rng()*60;  temp *= 0.72; }
  else if(lc.code === 'I'){   lum *= 4000 + rng()*20000; temp *= 0.62; }
  else if(lc.code === 'D'){
    /* Naine blanche : cœur dégénéré, très chaude mais de la taille de la Terre */
    temp = 6000 + rng()*24000;
    mass = 0.5 + rng()*0.7;
    lum = 4*Math.PI*Math.pow(0.013, 2)*Math.pow(temp/T_SUN, 4);
  }
  /* Plancher physique : aucune étoile connue ne descend sous ~2000 K
     (limite de la fusion de l'hydrogène ; en dessous ce sont des naines brunes) */
  if(lc.code !== 'D') temp = Math.max(temp, 2100);

  const radius = (lc.code === 'D') ? 0.013*Math.pow(0.6/mass, 1/3) : radiusFromLT(lum, temp);
  const color = blackbodyRGB(temp);

  const designation = (lc.code === 'D')
    ? 'D' + sc.cls + ' ' + sub
    : sc.cls + sub + ' ' + lc.code;

  return {
    spectralClass: sc.cls,
    subClass: sub,
    lumClass: lc.code,
    lumLabel: lc.label,
    designation: designation,
    temp: temp,          // K
    mass: mass,          // M☉
    lum: lum,            // L☉
    radius: radius,      // R☉
    color: color         // sRGB linéaire normalisé (teinte de corps noir)
  };
}
/* Types de nébuleuses : couleur de cœur (colorA) et couleur de bord (colorB).
   Le dégradé cœur→bord est ce qui donne leur volume aux bouffées de gaz. */
const NEBULA_TYPES = [
  {key:'emission',   name:'Nébuleuse en émission',    colorA:0xff5d8a, colorB:0x7a2d6b},
  {key:'hii',        name:'Région HII',               colorA:0xff8fa8, colorB:0x8e3f7a},
  {key:'dark',       name:'Nébuleuse obscure',        colorA:0x3a2a5c, colorB:0x140e26},
  {key:'planetary',  name:'Nébuleuse planétaire',     colorA:0x7dffe8, colorB:0x1d6f82},
  {key:'supernova',  name:'Rémanent de supernova',    colorA:0xffb066, colorB:0x8f3a2a},
  {key:'nursery',    name:'Pouponnière stellaire',    colorA:0xc08cff, colorB:0x3d47a8},
  {key:'reflection', name:'Nébuleuse par réflexion',  colorA:0x8fb8ff, colorB:0x2a3f8f},
  {key:'molecular',  name:'Nuage moléculaire',        colorA:0x5e7ba8, colorB:0x1e2a4d},
  {key:'oiii',       name:'Nébuleuse en émission OIII',colorA:0x6fffc4, colorB:0x2a7a6b}
];

