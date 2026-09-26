/* =====================================================================
   HUBLOTS, BAIES ET HANGARS RÉALISTES — option du générateur (sans modifier le moteur)
   Les vitrages plats du générateur (hublots lumineux, baies panoramiques, vitres de passerelle,
   baie de soute du Vagabonde) sont remplacés par un seul maillage par vaisseau, rendu par
   « interior mapping » : derrière chaque ouverture, le shader lance le rayon de vue dans une
   pièce virtuelle (murs, sol, plafond, mobilier en volumes analytiques, silhouettes), avec
   - un cadre en relief sur la coque (boulons, chevrons pour les hangars) et une embrasure
     en retrait (épaisseur de coque) éclairée par l'étoile ;
   - un vitrage qui reflète l'étoile (Fresnel), s'encrasse avec l'âge du vaisseau ;
   - un éclairage intérieur propre à chaque pièce (chaud, froid, tamisé, éteint), qui change
     lentement, et la tache de soleil qui entre par l'ouverture ;
   - des hangars ouverts sur le vide : baies latérales (Vagabonde) et baies ventrales ajoutées
     au module arrière des pousseurs et du paquebot, au point d'amarrage du jeu (dockPt).
   Réglages globaux (mis à jour par la démo) : window.__SHIPGLASS.U = { uSunDir, uSunCol, uSunI, uTime }.
   Désactivable : SHIPGEN.build(modèle, { realGlass: false }) ; baies ventrales : { dockBay: false }.
   ===================================================================== */
(function(){
'use strict';
if(typeof SHIPGEN === 'undefined') return;
const GL = window.__SHIPGLASS = {};
const V3 = THREE.Vector3;
const U = GL.U = { uSunDir: { value: new V3(.7, .6, -.3).normalize() }, uSunCol: { value: new THREE.Color(1, .97, .92) }, uSunI: { value: 1 }, uTime: { value: 0 } };
const TYPE = { port: 0, bridge: 1, pano: 2, dock: 3, belly: 4 };

/* baies ventrales ajoutées : dimensions du module d'habitation (paramètres du générateur) */
const BELLY = {
  tS:  { w: 10.2, h: 10.2, modL: 15.6, ch: .2929 },
  tM:  { w: 12.6, h: 12.6, modL: 16.8, ch: .2929 },
  tL:  { w: 16.8, h: 20.4, modL: 15.6, ch: .15 },
  l20: { w: 20.4, h: 23.4, modL: 14.4, ch: .15 }
};

const VERT = `
attribute vec3 aT; attribute vec4 aWinP; attribute vec4 aWinA; attribute vec4 aRoom; attribute vec2 aRoom2;
uniform vec3 uSunDir;
varying vec3 vV; varying vec3 vSun; varying vec4 vP; varying vec4 vA; varying vec4 vR; varying vec2 vR2;
#ifdef PORTAL
varying vec3 vW; varying vec3 vTw; varying vec3 vBw; varying vec3 vNw;
#endif
void main(){
  vec4 wp = modelMatrix*vec4(position, 1.0);
  vec3 Tw = normalize(mat3(modelMatrix)*aT), Nw = normalize(mat3(modelMatrix)*normal), Bw = cross(Nw, Tw);
#ifdef PORTAL
  float sc = length(mat3(modelMatrix)*aT);
  vW = wp.xyz; vTw = Tw*sc; vBw = Bw*sc; vNw = Nw*sc;
#endif
  vec3 V = wp.xyz - cameraPosition;                       /* rayon de vue exprimé dans le repère de l'ouverture */
  vV = vec3(dot(V, Tw), dot(V, Bw), dot(V, Nw));
  vSun = vec3(dot(uSunDir, Tw), dot(uSunDir, Bw), dot(uSunDir, Nw));
  vP = aWinP; vA = aWinA; vR = aRoom; vR2 = aRoom2;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;

const FRAG = `
precision highp float;
uniform vec3 uSunCol; uniform float uSunI; uniform float uTime; uniform float uAge;
varying vec3 vV; varying vec3 vSun; varying vec4 vP; varying vec4 vA; varying vec4 vR; varying vec2 vR2;
#ifdef PORTAL
uniform mat4 projectionMatrix; uniform vec4 uRip[3]; uniform float uField;
varying vec3 vW; varying vec3 vTw; varying vec3 vBw; varying vec3 vNw;
#endif
float h1(float n){ return fract(sin(n*127.1 + 1.7)*43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float apm(vec2 q, vec2 h, float rnd){ return rnd > 0.5 ? length(q)/h.x : max(abs(q.x)/h.x, abs(q.y)/h.y); }
vec3 gD;
/* rayon / boîte alignée : garde l'intersection la plus proche */
bool boxHit(vec3 o, vec3 bmin, vec3 bmax, inout float tBest, inout vec3 nBest){
  vec3 t0 = (bmin - o)/gD, t1 = (bmax - o)/gD;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  if(a <= b && a > 0.0 && a < tBest){
    tBest = a;
    nBest = (tn.x >= tn.y && tn.x >= tn.z) ? vec3(-sign(gD.x), 0.0, 0.0) : (tn.y >= tn.z ? vec3(0.0, -sign(gD.y), 0.0) : vec3(0.0, 0.0, -sign(gD.z)));
    return true;
  }
  return false;
}
/* silhouette (personne) sur un plan parallèle à la vitre */
bool person(vec3 o, float zc, float xc, float yf, float tMax, inout float tBest){
  float t = (zc - o.z)/gD.z; if(t <= 0.0 || t >= tBest || t >= tMax) return false;
  vec2 q = o.xy + gD.xy*t - vec2(xc, yf);
  float head = length(q - vec2(0.0, 1.62)) - 0.12;
  vec2 b = q - vec2(0.0, clamp(q.y, 0.15, 1.38));
  float body = length(vec2(b.x*(1.0 + 0.35*smoothstep(0.9, 0.2, q.y)), b.y)) - 0.21;
  if(min(head, body) < 0.0){ tBest = t; return true; }
  return false;
}
vec3 screenCol(float k){ return k < 0.4 ? vec3(0.1, 0.55, 0.9) : (k < 0.7 ? vec3(0.95, 0.55, 0.12) : (k < 0.85 ? vec3(0.2, 0.85, 0.45) : vec3(0.9, 0.2, 0.15))); }
void main(){
  float type = floor(vP.z + 0.5), seed = floor(vP.w + 0.5);   /* graine entière : insensible au bruit d'interpolation */
  vec2 p = vP.xy, h = vA.xy; float fw = vA.z, g = vA.w;
  float rnd = type < 0.5 ? 1.0 : 0.0, hangar = type > 2.5 ? 1.0 : 0.0;
  vec3 d = normalize(vV); d.z = min(d.z, -1e-3);
  gD = vec3(abs(d.x) < 1e-5 ? 1e-5 : d.x, abs(d.y) < 1e-5 ? 1e-5 : d.y, d.z);
  vec3 L = normalize(vSun);
  vec3 sunC = uSunCol*(1.65*uSunI);
  vec3 amb = vec3(0.043, 0.06, 0.1);
  float age = uAge;
  float pxs = fwidth(p.x) + fwidth(p.y);

  /* éclairage intérieur : état propre à chaque pièce, qui change lentement */
  float st = h1(seed*1.37 + floor(uTime/80.0 + seed*0.093)*3.1);
  vec3 lc = vec3(1.0, 0.72, 0.42); float li = 1.0;
  if(type < 0.5){ lc = st < 0.45 ? vec3(1.0, 0.72, 0.42) : (st < 0.62 ? vec3(0.8, 0.88, 1.0) : vec3(1.0, 0.5, 0.22)); li = st < 0.62 ? 1.0 : (st < 0.8 ? 0.3 : 0.03); }
  else if(type < 1.5){ lc = vec3(0.55, 0.72, 1.0); li = 0.7; }
  else if(type < 2.5){ lc = vec3(1.0, 0.76, 0.48); li = st < 0.85 ? 1.15 : 0.3; }
  else { lc = vec3(0.26, 0.56, 1.0); li = 1.9; }                 /* hangar : lumière bleutée (champ de force) */
  vec3 avg = lc*li*0.3;

  vec3 col; vec3 hitL = vec3(p, 0.0);
  float m0 = apm(p, h, rnd);
  if(m0 > 1.0){
    /* ---- cadre sur la coque : anneau en relief ---- */
    float e = rnd > 0.5 ? length(p) - h.x : max(abs(p.x) - h.x, abs(p.y) - h.y);
    if(e > fw) discard;
    float u = e/fw;
    vec2 rd = rnd > 0.5 ? p/max(length(p), 1e-4) : (abs(p.x) - h.x > abs(p.y) - h.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));
    float k = u < 0.28 ? -0.9 : (u > 0.8 ? 0.8 : 0.0);
    vec3 n = normalize(vec3(rd*k, 1.0));
    vec3 alb = vec3(0.3, 0.31, 0.33);
    if(hangar > 0.5){                                     /* rails de porte à chevrons */
      float s = fract((p.x + p.y)*0.9 + seed);
      alb = mix(vec3(0.03), vec3(0.62, 0.42, 0.04), step(0.5, s))*(u > 0.18 && u < 0.82 ? 1.0 : 0.35);
    }
    if(rnd > 0.5){                                        /* boulons */
      float a = floor(atan(p.y, p.x)*12.0/6.2831853 + 0.5)*6.2831853/12.0;
      vec2 bc = (h.x + 0.5*fw)*vec2(cos(a), sin(a));
      vec2 bq = (p - bc)/(0.14*fw);
      if(dot(bq, bq) < 1.0){ n = normalize(vec3(bq*0.8, 1.0)); alb = vec3(0.42); }
    }
    float grime = age*(0.4 + 0.6*vn(p*5.0 + fract(seed*0.37)*20.0));
    alb *= 1.0 - 0.45*grime;
    alb = mix(alb, vec3(0.22, 0.09, 0.03), age*0.6*smoothstep(0.55, 0.85, vn(p*2.5 - fract(seed*0.71)*20.0)));
    col = alb*(sunC*max(dot(n, L), 0.0) + amb);
    if(k < 0.0) col += alb*avg*0.6;                        /* lumière intérieure sur le chanfrein */
    if(hangar > 0.5 && u < 0.16){                           /* émetteurs du champ de force le long du seuil */
      float s = abs(p.x) - h.x > abs(p.y) - h.y ? p.y : p.x;
      float cell = step(fract(s*1.1 + 0.5), 0.7);
      float hum = 0.8 + 0.2*sin(uTime*9.0 + s*2.0) + 0.3*pow(fract(s*0.05 - uTime*0.35), 12.0);
      col += vec3(0.3, 0.68, 1.0)*cell*hum*1.6*(1.0 - u/0.16);
    }
    if(hangar > 0.5 && u > 0.84) col += vec3(1.0, 0.45, 0.08)*step(fract((p.x - p.y)*0.25 + 0.5), 0.06)*(0.6 + 2.0*step(0.5, fract(uTime*0.8 + seed*0.1)));   /* feux de position du seuil */
  } else {
    float tg = -g/d.z; vec2 pg = p + d.xy*tg;
    if(apm(pg, h, rnd) > 1.0){
      /* ---- embrasure : paroi du tunnel dans l'épaisseur de la coque ---- */
      float t; vec2 nxy;
      if(rnd > 0.5){
        float A = dot(d.xy, d.xy), B = dot(p, d.xy), Cq = dot(p, p) - h.x*h.x;
        t = (-B + sqrt(max(B*B - A*Cq, 0.0)))/max(A, 1e-8);
        nxy = -(p + d.xy*t)/h.x;
      } else {
        float tx = (sign(gD.x)*h.x - p.x)/gD.x, ty = (sign(gD.y)*h.y - p.y)/gD.y;
        t = min(tx, ty); nxy = tx < ty ? vec2(-sign(gD.x), 0.0) : vec2(0.0, -sign(gD.y));
      }
      vec3 q = vec3(p + d.xy*t, d.z*t); hitL = q;
      vec3 n = vec3(nxy, 0.0);
      float sl = 0.0;
      if(L.z > 0.01){ vec2 qs = q.xy + L.xy*(-q.z/L.z); sl = apm(qs, h*1.002, rnd) < 1.0 ? 1.0 : 0.0; }
      vec3 alb = vec3(0.16, 0.17, 0.18)*(1.0 - 0.35*age);
      float dk = clamp(-q.z/g, 0.0, 1.0);
      col = alb*(sunC*max(dot(n, L), 0.0)*sl + amb*(1.0 - 0.5*dk)) + alb*avg*1.4*dk*dk;
    } else {
      /* ---- vitrage puis pièce ---- */
      vec3 o = vec3(pg, -g);
      float x0 = vR.x, x1 = vR.y, y0 = vR.z, y1 = vR.w, D = vR2.x, xc = 0.5*(x0 + x1);
      float tx = ((gD.x > 0.0 ? x1 : x0) - o.x)/gD.x, ty = ((gD.y > 0.0 ? y1 : y0) - o.y)/gD.y, tz = (-D - o.z)/gD.z;
      float t; vec3 n; float sid;
      if(tz <= tx && tz <= ty){ t = tz; n = vec3(0.0, 0.0, 1.0); sid = 3.0; }
      else if(tx <= ty){ t = tx; n = vec3(-sign(gD.x), 0.0, 0.0); sid = 0.0; }
      else { t = ty; n = vec3(0.0, -sign(gD.y), 0.0); sid = gD.y < 0.0 ? 1.0 : 2.0; }
      float oid = 0.0;
      vec3 bn = n;
      float r1 = h1(seed*3.1), r2 = h1(seed*5.3), r3 = h1(seed*8.1);
      if(type < 0.5){                                   /* cabine : lit, meuble, occupant */
        float bw = min(2.0, (x1 - x0)*0.6);
        vec3 b0 = r1 < 0.5 ? vec3(x0 + 0.06, y0, -D) : vec3(x1 - 0.06 - bw, y0, -D);
        if(boxHit(o, b0, b0 + vec3(bw, 0.5, 0.95), t, bn)) oid = 1.0;
        vec3 c0 = r1 < 0.5 ? vec3(x1 - 0.65, y0, -D) : vec3(x0 + 0.05, y0, -D);
        if(boxHit(o, c0, c0 + vec3(0.6, 0.85, 0.5), t, bn)) oid = 2.0;
        if(li > 0.5 && r3 > 0.55 && person(o, -D*0.55, mix(x0 + 0.5, x1 - 0.5, r2), y0, 1e9, t)) oid = 9.0;
      } else if(type < 1.5){                            /* passerelle : pupitres, sièges */
        if(boxHit(o, vec3(x0, y0, -1.35), vec3(x1, y0 + 0.95, -0.45), t, bn)) oid = 3.0;
        for(int k = 0; k < 6; k++){ float xs = x0 + 1.1 + float(k)*2.3; if(xs < x1 - 0.5){ if(boxHit(o, vec3(xs - 0.3, y0, -2.35), vec3(xs + 0.3, y0 + 1.2, -1.85), t, bn)) oid = 4.0; } }
        if(r3 > 0.4 && person(o, -2.9, mix(x0 + 0.8, x1 - 0.8, r2), y0, 1e9, t)) oid = 9.0;
      } else if(type < 2.5){                            /* salon panoramique : canapé, table, plante, passagers */
        if(boxHit(o, vec3(x0 + 0.4, y0, -D), vec3(x1 - 0.4, y0 + 0.45, -D + 0.85), t, bn)) oid = 5.0;
        if(boxHit(o, vec3(x0 + 0.4, y0, -D), vec3(x1 - 0.4, y0 + 0.95, -D + 0.25), t, bn)) oid = 5.0;
        if(boxHit(o, vec3(xc - 0.6, y0, -D + 1.4), vec3(xc + 0.6, y0 + 0.4, -D + 2.0), t, bn)) oid = 6.0;
        if(boxHit(o, vec3(x0 + 0.25, y0, -D + 0.3), vec3(x0 + 0.7, y0 + 0.5, -D + 0.75), t, bn)) oid = 2.0;
        float tp = (-D + 0.52 - o.z)/gD.z;
        if(tp > 0.0 && tp < t){ vec2 q = o.xy + gD.xy*tp - vec2(x0 + 0.47, y0 + 1.05);
          float lf = min(min(length(q) - 0.33, length(q - vec2(0.2, 0.25)) - 0.22), length(q - vec2(-0.18, 0.28)) - 0.2);
          if(lf < 0.0){ t = tp; oid = 7.0; bn = vec3(0.0, 0.0, 1.0); } }
        if(li > 0.5 && r3 > 0.3 && person(o, -D + 1.6, mix(x0 + 1.2, x1 - 1.2, r2), y0, 1e9, t)) oid = 9.0;
        if(li > 0.5 && r1 > 0.6 && person(o, -D + 2.4, mix(x0 + 1.0, x1 - 1.0, fract(r2 + 0.45)), y0, 1e9, t)) oid = 9.0;
      } else if(type < 3.5){                            /* hangar latéral : nacelle, caisses, portique */
        float cx = r1 < 0.5 ? x1 - 2.9 : x0 + 0.3;
        if(boxHit(o, vec3(cx, y0, -D + 0.3), vec3(cx + 1.2, y0 + 1.2, -D + 1.5), t, bn)) oid = 12.0;
        if(boxHit(o, vec3(cx + 1.3, y0, -D + 0.3), vec3(cx + 2.5, y0 + 1.2, -D + 1.5), t, bn)) oid = 13.0;
        if(boxHit(o, vec3(cx + 0.1, y0 + 1.2, -D + 0.3), vec3(cx + 1.3, y0 + 2.4, -D + 1.5), t, bn)) oid = 14.0;
        if(boxHit(o, vec3(x0, y1 - 0.55, -D*0.8 - 0.22), vec3(x1, y1 - 0.25, -D*0.8 + 0.22), t, bn)) oid = 4.0;   /* portique au fond */
        if(boxHit(o, vec3(x0, y0 + 2.6, -D + 0.1), vec3(x1, y0 + 2.75, -D + 1.3), t, bn)) oid = 16.0;               /* coursive au fond */
        if(li > 0.5 && r3 > 0.35 && person(o, -D + 0.9, mix(x0 + 1.0, x1 - 1.0, r2), y0 + 2.75, 1e9, t)) oid = 9.0;
      } else {                                          /* baie ventrale : nacelle arrimée au plafond, caisses */
        float pc = 0.5*(x0 + x1);
        if(boxHit(o, vec3(pc - 0.6, -0.6, -D), vec3(pc + 0.6, 0.6, -D + 0.5), t, bn)) oid = 4.0;                       /* pince d'amarrage */
        float cx = r1 < 0.5 ? x1 - 2.9 : x0 + 0.3;
        if(boxHit(o, vec3(cx, y0, -D + 0.3), vec3(cx + 1.2, y0 + 1.1, -D + 1.5), t, bn)) oid = 12.0;
        if(boxHit(o, vec3(cx + 1.3, y0, -D + 0.3), vec3(cx + 2.5, y0 + 1.1, -D + 1.5), t, bn)) oid = 13.0;
        if(boxHit(o, vec3(cx, y1 - 1.1, -D + 0.3), vec3(cx + 1.2, y1, -D + 1.5), t, bn)) oid = 14.0;
        if(boxHit(o, vec3(x0, y0, -D*0.52), vec3(x1, y0 + 0.9, -D*0.47), t, bn)) oid = 16.0;                          /* coursive latérale */
        if(boxHit(o, vec3(x1 - 1.2, y0, -D*0.3 - 0.2), vec3(x1 - 0.8, y1, -D*0.3 + 0.2), t, bn)) oid = 4.0;             /* portique */
        if(li > 0.5 && r3 > 0.3 && person(o, -D*0.47, mix(x0 + 1.5, x1 - 1.5, r2), y0 + 0.9, 1e9, t)) oid = 9.0;
      }
      if(oid > 0.0) n = bn;
      vec3 hp = o + gD*t; hitL = hp;
      vec3 alb = vec3(0.4); vec3 em = vec3(0.0);
      /* ---- matières ---- */
      if(oid > 8.5 && oid < 9.5){ alb = vec3(0.12, 0.1, 0.09); n = vec3(0.0, 0.0, 1.0); }
      else if(oid > 9.5 && oid < 10.5){ alb = vec3(0.55, 0.56, 0.58); float yy = type > 3.5 ? hp.z : hp.y; if(fract(yy*1.2 + 0.3) < 0.18) alb = vec3(0.6, 0.22, 0.05); }
      else if(oid > 10.5 && oid < 11.5){ alb = vec3(0.04); em = vec3(0.3, 0.6, 1.0)*0.5*step(0.3, fract(hp.x*3.0 + hp.y*2.0)); }
      else if(oid > 14.5 && oid < 15.5) alb = vec3(0.06);
      else if(oid > 15.5 && oid < 16.5){ alb = vec3(0.09); if(n.z > 0.5 && fract(hp.x*2.5) < 0.2) alb = vec3(0.5, 0.34, 0.03); em = lc*li*0.6*step(0.93, fract(hp.x/1.4))*step(0.5, -n.z); }
      else if(oid > 11.5){ float kc = h1(oid + seed); alb = kc < 0.3 ? vec3(0.45, 0.18, 0.05) : (kc < 0.6 ? vec3(0.08, 0.2, 0.38) : vec3(0.3, 0.3, 0.1)); alb *= 0.8 + 0.2*step(0.5, fract((hp.x + hp.y + hp.z)*3.0)); }
      else if(type < 0.5){
        if(oid > 0.5 && oid < 1.5) alb = n.y > 0.5 ? vec3(0.6, 0.58, 0.55) : vec3(0.25, 0.2, 0.18);
        else if(oid > 1.5) alb = vec3(0.3, 0.22, 0.15);
        else if(sid == 1.0) alb = vec3(0.16, 0.11, 0.09);
        else if(sid == 2.0){ alb = vec3(0.55); if(abs(hp.z + D*0.5) < 0.25 && abs(hp.x - xc) < 0.5) em = lc*li*2.5; }
        else { alb = vec3(0.5, 0.44, 0.36)*(0.9 + 0.1*step(0.5, fract((sid == 0.0 ? hp.z : hp.x)*0.8))); if(sid == 3.0 && r2 > 0.5 && abs(hp.x - xc) < 0.35 && abs(hp.y - y0 - 1.5) < 0.25) alb = vec3(0.2, 0.35, 0.5); }
      } else if(type < 1.5){
        alb = sid == 1.0 ? vec3(0.05) : vec3(0.1, 0.12, 0.15);
        if(oid > 2.5 && oid < 3.5){ alb = vec3(0.08, 0.09, 0.1);
          if(n.y > 0.5){ float cx = fract((hp.x - x0)/0.8); if(cx > 0.12 && cx < 0.88 && hp.z < -0.6 && hp.z > -1.2) em = screenCol(h1(floor((hp.x - x0)/0.8) + seed))*(0.55 + 0.25*step(0.5, fract(hp.z*9.0 + uTime*0.3))); } }
        if(oid > 3.5 && oid < 4.5) alb = vec3(0.05, 0.05, 0.06);
        if(oid < 0.5 && sid == 3.0){ float cx = fract((hp.x - x0)/1.6); if(cx > 0.08 && cx < 0.86 && hp.y > y0 + 1.05 && hp.y < y0 + 2.05){ float kc = h1(floor((hp.x - x0)/1.6) + seed*2.0);
          em = screenCol(kc)*(0.35 + 0.35*step(0.45, fract(hp.y*7.0 + kc*3.0 - uTime*0.05*kc))); } }
        if(oid < 0.5 && sid == 2.0 && abs(hp.z + D*0.55) < 0.12) em = lc*li*2.0;
      } else if(type < 2.5){
        if(oid > 4.5 && oid < 5.5) alb = vec3(0.35, 0.12, 0.08);
        else if(oid > 5.5 && oid < 6.5) alb = vec3(0.3, 0.2, 0.12);
        else if(oid > 6.5 && oid < 7.5){ alb = vec3(0.08, 0.28, 0.06); n = vec3(0.0, 0.0, 1.0); }
        else if(oid > 1.5 && oid < 2.5) alb = vec3(0.35, 0.3, 0.25);
        else if(sid == 1.0) alb = vec3(0.32, 0.18, 0.09)*(0.82 + 0.18*step(0.5, fract(hp.x*3.0)));
        else if(sid == 2.0){ alb = vec3(0.6); vec2 lq = vec2(fract((hp.x - x0)/1.6) - 0.5, hp.z + D*0.5); if(length(lq*vec2(1.6, 1.0)) < 0.18) em = lc*li*3.0; }
        else alb = vec3(0.55, 0.47, 0.37);
      } else {
        float along = sid == 0.0 ? -hp.z : hp.x - x0;          /* coordonnée le long de la paroi (x est constant sur les parois latérales) */
        alb = vec3(0.14, 0.15, 0.16);
        if(oid < 0.5){
          vec2 pw2 = sid == 3.0 ? hp.xy : (sid == 0.0 ? hp.yz : hp.xz);
          if(min(fract(pw2.x/2.0), fract(pw2.y/2.0)) < 0.025) alb = vec3(0.07);                   /* joints de panneaux */
          if(fract(along/1.4) < 0.12 && !(type < 3.5 && sid == 1.0) && sid != 3.0) alb = vec3(0.05);  /* nervures */
          if(type < 3.5 && sid == 1.0){ alb = vec3(0.07);                                       /* sol balisé */
            float lx = abs(abs(hp.x - mix(x0 + 3.2, x1 - 3.2, r1) + 0.3) - 2.6), lz = abs(abs(hp.z + D*0.52) - D*0.3);
            if(min(lx, lz) < 0.07) alb = vec3(0.55, 0.38, 0.04);
            if(hp.z > -1.0 && fract((hp.x + hp.z)*0.9) < 0.5) alb = vec3(0.5, 0.34, 0.03); }
          float sd = type < 3.5 ? (sid == 2.0 ? 1.0 : 0.0) : (sid == 3.0 ? 1.0 : 0.0);          /* rampes lumineuses */
          float cross_ = type < 3.5 ? abs(hp.z + D*0.5) : abs(hp.y);
          if(type < 3.5){ if(sd > 0.5 && fract(along/2.8) < 0.1 && cross_ < D*0.38) em = lc*li*2.4; }
          else if(sd > 0.5 && abs(abs(hp.y) - (y1 - y0)*0.34) < 0.09) em = lc*li*2.6;             /* deux rampes continues au plafond */
          else if(sid == 3.0 && length(vec2(fract(along/3.0) - 0.5, (abs(hp.y) - (y1 - y0)*0.18)*0.35)) < 0.07) em = lc*li*3.0;
          if(sid == 3.0 && type < 3.5 && hp.y < y0 + 0.5 && fract((hp.x + hp.y)*1.1) < 0.5) alb = vec3(0.5, 0.34, 0.03);
          vec3 bc = vec3(x1 - 0.45, type < 3.5 ? y1 - 0.45 : y1 - 0.45, -D);                       /* gyrophare */
          if(sid == 3.0 && length(hp.xy - bc.xy) < 0.16) em = vec3(1.0, 0.45, 0.05)*(0.4 + 3.0*pow(0.5 + 0.5*sin(uTime*5.0 + seed), 6.0));
        }
        if(oid > 3.5 && oid < 4.5) alb = vec3(0.1);
      }
      /* ---- éclairage : plafonnier, occlusion des angles, tache de soleil ---- */
      vec3 lp = type > 3.5 ? vec3(xc, 0.0, -D + 0.5) : vec3(xc, y1 - 0.15, -D*0.5);
      vec3 lv = lp - hp; float ld2 = dot(lv, lv);
      float fall = hangar > 0.5 ? 0.04 : 0.12;
      vec3 irr = lc*li*(max(dot(n, normalize(lv)), 0.0)*(2.2/(1.0 + ld2*fall)) + 0.22);
      vec3 ed = vec3(min(hp.x - x0, x1 - hp.x), min(hp.y - y0, y1 - hp.y), hp.z + D);
      if(sid == 0.0) ed.x = 9.0; else if(sid < 2.5) ed.y = 9.0; else ed.z = 9.0;
      float ao = oid > 0.5 ? 0.85 : 0.45 + 0.55*smoothstep(0.0, 0.9, min(min(ed.x, ed.y), ed.z));
      float sp = 0.0;
      if(L.z > 0.01){ vec2 qs = hp.xy + L.xy*((-g - hp.z)/L.z); sp = apm(qs, h, rnd) < 1.0 ? 1.0 : 0.0; }
      vec3 inside = alb*(irr*ao + sunC*max(dot(n, L), 0.0)*sp*(1.0 - 0.4*age)) + em;
      if(type < 0.5 && r2 < 0.28 && li > 0.1){          /* store à demi baissé */
        float yb = mix(-0.3*h.y, 0.8*h.y, r1);
        if(pg.y > yb) inside = lc*li*0.22*vec3(0.95, 0.88, 0.78) + vec3(0.02)*sunC*max(L.z, 0.0);
      }
      if(hangar > 0.5){
        /* hangar ouvert sur le vide, fermé par un champ de force : voile bleu translucide, bords vifs, ondulations, onde au passage */
        float eg = min(h.x - abs(pg.x), h.y - abs(pg.y));
        float fres = pow(1.0 + d.z, 2.0);
        float flow = vn(pg*0.35 + vec2(uTime*0.25, uTime*0.11))*vn(pg*0.9 - vec2(uTime*0.13, -uTime*0.2));
        float ring = 0.0, fld = 1.0;
#ifdef PORTAL
        fld = uField;
        { float bi = vR2.y; vec4 Rp = bi < 0.5 ? uRip[0] : (bi < 1.5 ? uRip[1] : uRip[2]); float ta = uTime - Rp.z;   /* onde de la baie concernée */
          if(Rp.w > 0.0 && ta > 0.0 && ta < 4.0){ float dd = length(pg - Rp.xy), rr = ta*7.0;
            ring += (exp(-pow((dd - rr)/0.8, 2.0))*exp(-ta*1.1) + exp(-dd*dd/3.0)*exp(-ta*2.5))*Rp.w; } }
#endif
        float fk = fld*(0.05 + 0.2*fres + 0.55*exp(-eg/0.35) + 0.1*flow + 1.5*ring);
        col = inside*(1.0 - 0.1*fld) + vec3(0.1, 0.42, 1.0)*fk + vec3(0.55, 0.85, 1.0)*fld*0.12*pow(flow, 3.0);
      } else {
        float F = 0.04 + 0.96*pow(1.0 + d.z, 5.0);
        vec3 r = reflect(d, vec3(0.0, 0.0, 1.0));
        float glint = pow(max(dot(r, L), 0.0), 700.0)*step(0.0, L.z);
        vec3 env = vec3(0.004, 0.006, 0.012) + sunC*glint*30.0;
        float dirt = age*(0.35 + 0.65*vn(pg*4.0 + fract(seed*0.618)*20.0));
        vec3 tint = type > 0.5 && type < 1.5 ? vec3(0.55, 0.68, 0.75) : vec3(0.9, 0.93, 0.95);
        col = inside*tint*(1.0 - F)*(1.0 - 0.5*dirt) + env*F + sunC*max(L.z, 0.0)*dirt*0.05;
        if(type > 1.5 && abs(abs(pg.x) - h.x/3.0) < 0.05){          /* meneaux de la baie */
          vec3 mn = normalize(vec3(sign(pg.x)*(abs(pg.x) - h.x/3.0)*12.0, 0.0, 1.0));
          col = vec3(0.3)*(sunC*max(dot(mn, L), 0.0) + amb) + avg*0.2;
        }
      }
    }
    col = mix(col, avg + vec3(0.01), smoothstep(0.35, 1.3, pxs/max(min(h.x, h.y), 0.05)));   /* de loin : lueur moyenne, sans scintillement */
  }
  gl_FragColor = vec4(col, 1.0);
#ifdef PORTAL
  { vec3 hw = vW + vTw*(hitL.x - p.x) + vBw*(hitL.y - p.y) + vNw*hitL.z;   /* profondeur du point réellement vu : les vraies navettes s'y cachent ou s'y montrent */
    vec4 cp = projectionMatrix*viewMatrix*vec4(hw, 1.0);
    gl_FragDepthEXT = m0 > 1.0 ? gl_FragCoord.z : clamp(cp.z/cp.w*0.5 + 0.5, 0.0, 1.0); }
#endif
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;

GL.material = function(age, portal){
  const uni = { uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSunI: U.uSunI, uTime: U.uTime, uAge: { value: age || 0 } };
  if(portal){ uni.uRip = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }; uni.uField = { value: 1 }; }
  const m = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, defines: portal ? { PORTAL: 1 } : {} });
  m.extensions = { derivatives: true, fragDepth: !!portal };
  m.userData.lin = true;
  if(portal){
    // passe B : là où la passe A a marqué le stencil, l'intérieur remplace la coque et écrit sa vraie profondeur, puis le stencil est remis à zéro
    m.depthFunc = THREE.AlwaysDepth; m.depthWrite = true;
    m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc;
    m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp; m.stencilZPass = THREE.ZeroStencilOp;
  }
  return m;
};
/* passe A des portails : quad invisible, testé en profondeur contre ce qui est déjà dessiné (coque, autres vaisseaux) ; marque le stencil là où la baie est vue */
function maskMaterial(){                                   // un par vaisseau (libéré avec lui) ; programme GPU commun
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp; m.stencilZPass = THREE.ReplaceStencilOp;
  m.userData.lin = true; return m;
}
GL.RENDER_ORDER = { mask: 5, portal: 6, craft: 7 };       // coques → masques → intérieurs des baies → petits engins (qui peuvent y entrer)

/* ---------- relevé des vitrages du générateur ---------- */
function survey(group){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), items = [], strip = [];
  group.traverse(o => {
    if(!o.isMesh || !o.geometry || o.geometry.type !== 'PlaneGeometry') return;
    const m = o.material, P = o.geometry.parameters;
    let kind = null;
    if(m.isMeshBasicMaterial && !m.transparent && !m.map) kind = 'bridge';
    else if(m.isShaderMaterial && m.uniforms && m.uniforms.uColor) kind = 'port';
    else if(m.isShaderMaterial && /mull/.test(m.fragmentShader || '')) kind = 'pano';
    else if(m.isMeshStandardMaterial && !m.map && !m.transparent) kind = 'dock';
    else if(m.isMeshStandardMaterial && m.map && !m.transparent) kind = 'stripe';
    if(!kind) return;
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const it = { kind, mesh: o, w: P.width, h: P.height, C: new V3().setFromMatrixPosition(M), T: new V3().setFromMatrixColumn(M, 0).normalize(), N: new V3().setFromMatrixColumn(M, 2).normalize() };
    (kind === 'stripe' ? strip : items).push(it);
  });
  // bandes de danger au-dessus de la baie de soute (remplacées par les rails du cadre)
  items.filter(i => i.kind === 'dock').forEach(dk => strip.forEach(s => { if(Math.abs(s.C.z - dk.C.z) < .05 && s.N.dot(dk.N) > .9 && Math.abs(s.w - dk.w) < .05) items.push(Object.assign(s, { kind: 'drop' })); }));
  return items;
}
const key = (it) => (it.N.x > 0 ? 'p' : 'n') + Math.round(it.C.y*20);

/* ---------- construction d'un maillage d'ouvertures (partagée avec les petits engins) ---------- */
function seedOf(i, s0){ return 1 + Math.floor(((Math.sin((i + 1)*12.9898 + s0*78.233)*43758.5453 % 1) + 1)%1*97); }
function glassGeometry(wins, s0){
  const n = wins.length, P = new Float32Array(n*12), Nn = new Float32Array(n*12), Ta = new Float32Array(n*12), WP = new Float32Array(n*16), WA = new Float32Array(n*16), RM = new Float32Array(n*16), R2 = new Float32Array(n*8), idx = [];
  wins.forEach((w, i) => {
    const it = w.it, T = it.T, N = it.N, B = new V3().crossVectors(N, T), ex = w.hx + w.fw, ey = w.hy + w.fw, seed = w.seed || seedOf(i, s0);
    const C = it.C.clone().addScaledVector(N, w.lift !== undefined ? w.lift : .03);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c, j) => {
      const v = C.clone().addScaledVector(T, c[0]*ex).addScaledVector(B, c[1]*ey), k = i*4 + j;
      P.set([v.x, v.y, v.z], k*3); Nn.set([N.x, N.y, N.z], k*3); Ta.set([T.x, T.y, T.z], k*3);
      WP.set([c[0]*ex, c[1]*ey, w.type, seed], k*4); WA.set([w.hx, w.hy, w.fw, w.g], k*4); RM.set(w.room, k*4); R2.set([w.D, w.bi || 0], k*2);
    });
    idx.push(i*4, i*4 + 1, i*4 + 2, i*4, i*4 + 2, i*4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(Ta, 3)); g.setAttribute('aWinP', new THREE.BufferAttribute(WP, 4)); g.setAttribute('aWinA', new THREE.BufferAttribute(WA, 4));
  g.setAttribute('aRoom', new THREE.BufferAttribute(RM, 4)); g.setAttribute('aRoom2', new THREE.BufferAttribute(R2, 2));
  g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
/* hublots / vitres pour d'autres coques (petits engins) : specs = [{ C, T, N, w, h, kind: 'bridge'|'port'|'pano', D, room? }] */
GL.addWindows = function(group, specs, age, seed0){
  const s0 = (seed0 || 0)%9973 + 1;
  const wins = specs.map(sp => {
    const it = { C: sp.C, T: sp.T, N: sp.N };
    if(sp.kind === 'port'){ const r = sp.w/2; return { it, type: TYPE.port, hx: r, hy: r, fw: sp.fw || .12*r + .03, g: sp.g || .08, room: sp.room || [-1.1, 1.1, -1.1, 1.0], D: sp.D || 1.8, lift: sp.lift }; }
    const hx = sp.w/2, hy = sp.h/2, y0 = -hy - (sp.floor !== undefined ? sp.floor : .7);
    return { it, type: sp.kind === 'pano' ? TYPE.pano : TYPE.bridge, hx, hy, fw: sp.fw || .06, g: sp.g || .06, room: sp.room || [-hx - .4, hx + .4, y0, Math.max(y0 + 2.1, hy + .4)], D: sp.D || 1.8, lift: sp.lift };
  });
  const mesh = new THREE.Mesh(glassGeometry(wins, s0), GL.material(age));
  mesh.userData.glass = true; mesh.userData.noFrame = true; group.add(mesh);
  return mesh;
};

/* baies latérales ajoutées (grande baie à champ de force, côté tribord) : module d'habitation et hauteur */
const SIDE = {
  tL:  { w: 16.8, h: 20.4, modL: 15.6, mod: 1, y: -1.2, hy: 3.2 },
  l20: { w: 20.4, h: 23.4, modL: 14.4, mod: 2, y: -1.6, hy: 3.5 }
};

/* ---------- vitrages et baies d'un vaisseau du générateur ---------- */
GL.apply = function(group, model, age, seed0, withBays){
  const items = survey(group);
  const wins = [], bays = [];
  const s0 = (seed0 || 0)%9973 + 1;
  // baie latérale ajoutée : zone réservée (les hublots qui s'y trouvaient disparaissent)
  const Sd = withBays ? SIDE[model] : null;
  let sideBay = null;
  if(Sd){
    const zc = 2.7 + Sd.mod*(Sd.modL + 2.7) + Sd.modL/2, hx = .43*Sd.modL, fw = .45;
    sideBay = { it: { kind: 'side', C: new V3(Sd.w/2 + .02, Sd.y, zc), T: new V3(0, 0, -1), N: new V3(1, 0, 0) }, type: TYPE.dock, hx, hy: Sd.hy, fw, g: .05,
      room: [-hx - 1.2, hx + 1.2, -Sd.hy - .05, Sd.hy + 2.2], D: .85*Sd.w, mode: 'side' };
  }
  const blocked = it => sideBay && it.N.x > .5 && Math.abs(it.C.z - sideBay.it.C.z) < sideBay.hx + sideBay.fw + it.w/2 + .2 && Math.abs(it.C.y - Sd.y) < Sd.hy + sideBay.fw + it.h/2 + .2;
  // rangées (passerelle, hublots) : la pièce s'étend sur toute la rangée ou jusqu'aux voisins
  const rows = {};
  items.forEach(it => { if((it.kind === 'bridge' || it.kind === 'port') && !blocked(it)){ const k = it.kind + key(it); (rows[k] = rows[k] || []).push(it); } });
  Object.values(rows).forEach(list => {
    list.forEach(it => it.s = it.C.dot(it.T)); list.sort((a, b) => a.s - b.s);
    const lo = list[0].s - list[0].w/2, hi = list[list.length-1].s + list[list.length-1].w/2;
    list.forEach((it, i) => {
      const depth = Math.abs(it.C.dot(it.N));
      if(it.kind === 'bridge'){
        const hx = it.w/2, hy = it.h/2, y0 = -hy - .95;
        wins.push({ it, type: TYPE.bridge, hx, hy, fw: .1, g: .1, room: [lo - .5 - it.s, hi + .5 - it.s, y0, Math.max(y0 + 2.5, hy + .6)], D: Math.min(6, Math.max(2.2, .85*depth)) });
      } else {
        const r = .27*it.w, gl = i > 0 ? it.s - list[i-1].s : 9, gr = i < list.length - 1 ? list[i+1].s - it.s : 9;
        wins.push({ it, type: TYPE.port, hx: r, hy: r, fw: .16*r + .05, g: .18, room: [-Math.max(r + .1, Math.min(1.7, .5*gl)), Math.max(r + .1, Math.min(1.7, .5*gr)), -1.25, 1.15], D: Math.min(3.4, Math.max(1.8, .8*depth)) });
      }
    });
  });
  items.forEach(it => {
    const depth = Math.abs(it.C.dot(it.N));
    if(it.kind === 'pano' && !blocked(it)){
      const hx = it.w/2 - .05, hy = it.h/2 - .05, y0 = -hy - .3;
      wins.push({ it, type: TYPE.pano, hx, hy, fw: .14, g: .12, room: [-hx - .35, hx + .35, y0, Math.max(hy + .45, y0 + 2.6)], D: Math.min(5.5, Math.max(2.5, .85*depth)) });
    } else if(it.kind === 'dock'){
      const hx = .63*it.w, hy = it.h/2;
      bays.push({ it, type: TYPE.dock, hx, hy, fw: .3, g: .05, room: [-hx - .5, hx + .5, -hy - .02, hy + 1.7], D: Math.min(9, Math.max(4, 1.8*depth)), mode: 'side' });
    }
  });
  if(sideBay) bays.push(sideBay);
  // baie ventrale ajoutée au module arrière (point d'amarrage du jeu)
  const Bm = BELLY[model], dp = group.userData.dockPt;
  if(withBays && Bm && dp){
    const flat = Bm.w*(1 - 2*Bm.ch), fw = .35, hx = .36*Bm.modL, hy = .5*flat*.92 - fw, wy = Math.min(Bm.w*.42, hy + 1.6);
    const it = { kind: 'belly', C: new V3(dp.x, dp.y - .03, dp.z), T: new V3(0, 0, 1), N: new V3(0, -1, 0) };
    bays.push({ it, type: TYPE.belly, hx, hy, fw, g: .05, room: [-hx - .6, hx + .6, -wy, wy], D: Math.min(10, .7*Bm.h), mode: 'belly' });
  }
  if(!wins.length && !bays.length) return null;
  // retrait des vitrages d'origine
  items.forEach(it => { if(it.mesh && it.mesh.parent){ it.mesh.parent.remove(it.mesh); it.mesh.geometry.dispose(); } });
  const out = { count: wins.length + bays.length, docks: [] };
  if(wins.length){
    const mesh = new THREE.Mesh(glassGeometry(wins, s0), GL.material(age));
    mesh.userData.glass = true; mesh.userData.noFrame = true; group.add(mesh);
    out.mesh = mesh; out.uAge = mesh.material.uniforms.uAge;
  }
  if(bays.length){
    bays.forEach((w, i) => { w.bi = i; w.seed = seedOf(100 + i, s0); });
    const g = glassGeometry(bays, s0), mat = GL.material(age, true);
    const mask = new THREE.Mesh(g, maskMaterial()), draw = new THREE.Mesh(g, mat);
    mask.renderOrder = GL.RENDER_ORDER.mask; draw.renderOrder = GL.RENDER_ORDER.portal;
    [mask, draw].forEach(m => { m.userData.glass = true; m.userData.noFrame = true; m.userData.portal = true; group.add(m); });
    // halo du champ de force sur la coque autour de l'ouverture (additif, façon « bloom »)
    const glowWins = bays.map(w => Object.assign({}, w, { fw: w.fw + Math.min(3, .45*Math.min(w.hx, w.hy) + 1), lift: .06 }));
    const glow = new THREE.Mesh(glassGeometry(glowWins, s0), new THREE.ShaderMaterial({ uniforms: { uField: mat.uniforms.uField, uTime: U.uTime },
      vertexShader: 'attribute vec4 aWinP; attribute vec4 aWinA; varying vec2 vP; varying vec2 vH; varying float vF; void main(){ vP = aWinP.xy; vH = aWinA.xy; vec4 wp = modelMatrix*vec4(position, 1.0); vec3 Nw = normalize(mat3(modelMatrix)*normal); vF = abs(dot(Nw, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix*viewMatrix*wp; }',
      fragmentShader: 'precision highp float; uniform float uField; uniform float uTime; varying vec2 vP; varying vec2 vH; varying float vF; void main(){ vec2 q = abs(vP) - vH; float dOut = length(max(q, 0.0)); if(max(q.x, q.y) < 0.0) discard; float g = exp(-dOut/1.1)*(0.55 + 0.45*vF)*uField*(0.9 + 0.1*sin(uTime*2.3)); gl_FragColor = vec4(vec3(0.12, 0.42, 1.0)*g*0.55, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.renderOrder = GL.RENDER_ORDER.craft + 1; glow.userData.glass = true; glow.userData.noFrame = true; group.add(glow);
    out.bays = { mask, draw, glow, uRip: mat.uniforms.uRip.value, uField: mat.uniforms.uField };
    bays.forEach(w => { const it = w.it, B = new V3().crossVectors(it.N, it.T);
      out.docks.push({ bi: w.bi, C: it.C.clone(), N: it.N.clone(), T: it.T.clone(), B, hx: w.hx, hy: w.hy, D: w.D, room: w.room.slice(), mode: w.mode, ventral: w.mode === 'belly', rip: mat.uniforms.uRip.value[w.bi] }); });
  }
  return out;
};

/* le générateur remplace ses vitrages (désactivable : { realGlass: false } ; baies ventrales : { dockBay: false }) */
const build0 = SHIPGEN.build;
SHIPGEN.build = function(model, opts){
  const b = build0.call(SHIPGEN, model, opts);
  if(!(opts && opts.realGlass === false)){
    const r = GL.apply(b.group, model, opts && opts.age ? +opts.age : 0, opts && opts.ageSeed, !(opts && opts.dockBay === false));
    if(r){ b.glass = r; b.docks = r.docks; }
  }
  return b;
};
})();
