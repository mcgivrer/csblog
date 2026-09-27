/* =====================================================================
   PLANÈTES DÉTAILLÉES — surface procédurale à détail adaptatif,
   3 couches de nuages, atmosphère diffusante.
   Remplace à chaud les matériaux créés par buildPlanetSystemMeshes().
   ===================================================================== */
(function(){
'use strict';
const PL = window.__PLANETS = {};
const PIX = { value: .001 };                       // taille angulaire d'un pixel (partagée par tous les matériaux)
PL.PIX = PIX;

/* ---------- GLSL commun ---------- */
const NOISE = `
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
/* bruit simplex 3D (Ashima Arts / S. Gustavson, licence MIT) */
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
/* fBm à nombre d'octaves fractionnaire : les octaves fines n'apparaissent que lorsqu'elles sont résolues à l'écran */
float fbmA(vec3 p, float oct){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < 12; i++){
    float w = clamp(oct - float(i), 0.0, 1.0);
    if(w <= 0.0) break;
    v += a*w*snoise(p);
    p = p*2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
float ridgedA(vec3 p, float oct){
  float v = 0.0, a = 0.5, prev = 1.0;
  for(int i = 0; i < 10; i++){
    float w = clamp(oct - float(i), 0.0, 1.0);
    if(w <= 0.0) break;
    float r = 1.0 - abs(snoise(p));
    r *= r;
    v += a*w*r*prev;
    prev = r;
    p = p*2.07 + vec3(4.3, 1.1, 7.7);
    a *= 0.5;
  }
  return v;
}
/* nombre d'octaves utiles pour une fréquence de base et une empreinte de pixel (en rayons planétaires) */
float octFor(float freq, float fp){ return clamp(log2(0.4/(freq*fp)), 1.0, 11.0); }
vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }
vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
`;

/* nuages : fonction partagée par les couches et par l'ombre portée au sol */
const CLOUDS = `
uniform vec4 uCyc1; uniform vec4 uCyc2; uniform float uCover; uniform float uCSeed;
vec3 cyclone(vec3 n, vec4 c, float strength){
  float d = length(n - c.xyz);
  float a = c.w * strength * exp(-d*d*28.0) / (d + 0.06);
  return rotAxis(n, c.xyz, a);
}
float cloudDensity(vec3 n, float layer, float oct, float t){
  vec3 so = vec3(uCSeed*0.173, uCSeed*0.091, uCSeed*0.137) + vec3(layer*17.3);
  float lat = n.y;
  if(layer < 0.5){
    /* couche basse : cumulus et amas convectifs, cyclones marqués */
    vec3 p = cyclone(cyclone(n, uCyc1, 0.09), uCyc2, 0.07);
    p = rotY(p, t*0.0021);
    vec3 w = vec3(snoise(p*2.1 + so), snoise(p*2.1 + so + 11.0), snoise(p*2.1 + so + 23.0));
    float v = 0.5 + 0.55*fbmA(p*5.5 + w*0.5 + so, oct);
    float belt = 0.72 + 0.42*(exp(-lat*lat*36.0) + exp(-(abs(lat) - 0.62)*(abs(lat) - 0.62)*22.0));
    float th = 1.0 - uCover*belt;
    return smoothstep(th, th + 0.14, v);
  } else if(layer < 1.5){
    /* couche moyenne : voiles et fronts étirés en longitude, enroulés par les cyclones */
    vec3 p = cyclone(cyclone(n, uCyc1, 0.16), uCyc2, 0.12);
    p = rotY(p, t*0.0012);
    vec3 q = vec3(p.x*2.0, p.y*5.5, p.z*2.0);
    vec3 w = vec3(snoise(q*0.8 + so), snoise(q*0.8 + so + 7.0), snoise(q*0.8 + so + 19.0));
    float v = 0.5 + 0.6*fbmA(q + w*0.9 + so, oct);
    float th = 1.18 - uCover*0.85;
    return smoothstep(th, th + 0.16, v)*0.75;
  }
  /* couche haute : cirrus filamenteux */
  vec3 p = rotY(cyclone(n, uCyc1, 0.1), t*0.0006);
  vec3 q = vec3(p.x*1.4, p.y*16.0, p.z*1.4);
  vec3 w = vec3(snoise(p*3.0 + so), snoise(p*3.0 + so + 5.0), snoise(p*3.0 + so + 9.0));
  float r = ridgedA(q + w*1.6 + so, oct);
  float mask = smoothstep(0.1, 0.5, 0.5 + 0.5*snoise(p*1.7 + so + 31.0));
  return smoothstep(0.42, 0.78, r)*mask*0.55*min(uCover*2.2, 1.0);
}
`;

/* ---------- surface ---------- */
const SURF_VERT = `
varying vec3 vObjNormal; varying vec3 vWorldNormal; varying vec3 vWorldPos;
void main(){
  vObjNormal = normal;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SURF_FRAG = `
precision highp float;
varying vec3 vObjNormal; varying vec3 vWorldNormal; varying vec3 vWorldPos;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform vec3 uLightObj; uniform vec3 uAtmoCol;
uniform float uOceanFrac; uniform float uSeed; uniform float uHue; uniform float uTime; uniform float uKind;
uniform float uRadius; uniform float uPixAng; uniform float uCities; uniform float uShadowRot; uniform float uHasAtmo;
uniform float uGas; uniform float uIcy; uniform float uVolcanic;
${NOISE}
${CLOUDS}
vec3 SO;
float terrain(vec3 n, float oct, out float mtn){
  vec3 p = n*1.7 + SO;
  vec3 w = vec3(snoise(p*0.9), snoise(p*0.9 + 31.7), snoise(p*0.9 + 57.1));
  float c = fbmA(n*2.1 + w*0.5 + SO, min(oct, 6.0));
  mtn = 0.0;
  if(oct > 2.2) mtn = ridgedA(n*7.5 + w*0.35 + SO*1.31, oct - 2.2);
  float inland = smoothstep(-0.02, 0.3, c);
  return c + 0.3*mtn*inland + (oct > 6.0 ? 0.06*fbmA(n*140.0 + SO, oct - 6.0) : 0.0);
}
vec3 gasGiant(vec3 n, float oct){
  float lat = n.y;
  float jet = sin(lat*23.0 + uSeed)*0.6 + sin(lat*9.0)*0.4;
  vec3 q = rotY(n, jet*uTime*0.003);
  float turb = fbmA(vec3(q.x*2.2, q.y*14.0, q.z*2.2) + SO, oct);
  float edd = oct > 3.0 ? fbmA(q*24.0 + SO + turb, oct - 3.0) : 0.0;
  /* grande tempête ovale */
  vec3 sc = normalize(vec3(sin(uSeed), 0.35*sin(uSeed*1.7) - 0.25, cos(uSeed)));
  vec3 dq = q - sc; dq.y *= 2.2;
  float sd = length(dq);
  float storm = exp(-sd*sd*38.0);
  vec3 qs = rotAxis(q, sc, storm*6.0/(sd + 0.2));
  float b = lat*11.0 + turb*1.5 + edd*0.45 + 0.5*snoise(vec3(qs.x, qs.y*5.0, qs.z)*1.6 + SO);
  float s1 = smoothstep(-0.55, 0.55, sin(b*3.14159)), s2 = smoothstep(-0.6, 0.6, sin(b*1.37 + 1.3));
  float hs = fract(uHue*3.7);
  vec3 c1 = mix(vec3(0.86,0.76,0.60), vec3(0.62,0.78,0.86), step(0.72, hs));
  vec3 c2 = mix(vec3(0.62,0.42,0.28), vec3(0.28,0.44,0.62), step(0.72, hs));
  vec3 c3 = mix(vec3(0.93,0.88,0.78), vec3(0.84,0.90,0.95), step(0.72, hs));
  vec3 c4 = mix(vec3(0.72,0.52,0.36), vec3(0.40,0.56,0.70), step(0.72, hs));
  vec3 col = mix(mix(c2, c1, s1), mix(c4, c3, s1), s2*0.7);
  col = mix(col, vec3(0.78,0.36,0.22), smoothstep(0.35, 0.9, storm)*0.8);
  col = mix(col, vec3(0.95,0.9,0.82), smoothstep(0.6, 1.0, storm)*smoothstep(0.1, 0.4, fbmA(qs*9.0 + SO, 3.0) + 0.3)*0.6);
  col *= 0.9 + 0.2*edd;
  return col;
}
void main(){
  SO = vec3(uSeed*0.137, uSeed*0.071, uSeed*0.113);
  vec3 n = normalize(vObjNormal);
  vec3 N = normalize(vWorldNormal), L = normalize(uLightDir), V = normalize(cameraPosition - vWorldPos);
  float dist = length(cameraPosition - vWorldPos);
  float fp = dist*uPixAng/uRadius;
  float ndl = dot(N, L);
  float mu = max(dot(N, V), 0.0);
  vec3 sun = uLightColor;
  if(uHasAtmo > 0.5) sun *= mix(vec3(1.0, 0.5, 0.26), vec3(1.0), smoothstep(-0.02, 0.35, ndl));
  vec3 albedo; float ocean = 0.0; float relief = 0.0; float h = 0.0; float e = 0.0; float temp = 1.0; float emissive = 0.0; vec3 emisCol = vec3(0.0);
  float oct = octFor(2.1, fp);
  float slopeLit = ndl;

  if(uKind > 4.5){
    albedo = gasGiant(n, octFor(10.0, fp));
  } else {
    float mtn;
    h = terrain(n, oct, mtn);
    float sea = mix(-0.5, 0.42, uOceanFrac);
    e = h - sea;
    float lat = abs(n.y);
    temp = 1.0 - pow(lat, 1.7)*1.08 - max(e - 0.1, 0.0)*1.3 + 0.1*snoise(n*4.0 + SO);
    float micro = clamp(oct - 5.0, 0.0, 1.0);
    float grain = 0.5 + 0.5*snoise(n*90.0 + SO);
    if(uKind < 1.5){
      /* monde océanique / continental : biomes selon latitude, altitude et humidité */
      if(e < 0.0){
        float d = -e; ocean = 1.0;
        albedo = mix(vec3(0.06,0.36,0.44), vec3(0.012,0.06,0.17), smoothstep(0.0, 0.16, d));
        albedo = mix(albedo, vec3(0.01,0.035,0.12), smoothstep(0.2, 0.6, d));
        float ice = smoothstep(0.12, 0.02, temp + 0.05*snoise(n*12.0 + SO));
        albedo = mix(albedo, vec3(0.86,0.9,0.95), ice); ocean *= 1.0 - ice;
      } else {
        float moist = 0.58 + 0.6*fbmA(n*3.1 + SO*0.7 + 11.0, min(oct, 5.0)) + 0.25*(1.0 - smoothstep(0.0, 0.1, e)) - 0.3*exp(-(lat - 0.36)*(lat - 0.36)*45.0);
        vec3 desert = vec3(0.76,0.58,0.36), savanna = vec3(0.55,0.52,0.28), grass = vec3(0.26,0.40,0.15);
        vec3 forest = vec3(0.09,0.24,0.08), jungle = vec3(0.04,0.19,0.06), tundra = vec3(0.44,0.43,0.35);
        vec3 rock = vec3(0.33,0.29,0.26), snow = vec3(0.95,0.96,0.98), sand = vec3(0.80,0.72,0.52);
        if(uHue > 0.82){ forest = forest.gbr*vec3(1.2,0.9,1.4); jungle = jungle.brg*vec3(1.3,1.0,1.2); grass = grass.gbr; }
        vec3 veg = mix(forest, jungle, smoothstep(0.62, 0.9, temp));
        vec3 dry = mix(desert, savanna, smoothstep(0.32, 0.5, moist));
        albedo = mix(dry, mix(grass, veg, smoothstep(0.55, 0.8, moist)), smoothstep(0.38, 0.62, moist));
        albedo = mix(albedo, tundra, smoothstep(0.38, 0.16, temp));
        albedo = mix(albedo, rock, clamp(smoothstep(0.22, 0.48, mtn*smoothstep(0.02, 0.2, e)) + smoothstep(0.28, 0.5, e)*0.7, 0.0, 1.0));
        albedo = mix(albedo, sand, (1.0 - smoothstep(0.001, 0.009, e))*mix(0.25, 0.85, micro));
        albedo = mix(albedo, snow, smoothstep(0.13, 0.04, temp));
        albedo *= mix(1.0, 0.82 + 0.36*grain, micro);
        relief = 1.0;
      }
    } else if(uKind < 2.5){
      /* monde désertique : ergs, canyons, lacs salés */
      vec3 w = vec3(snoise(n*6.0 + SO), snoise(n*6.0 + SO + 3.0), 0.0);
      float canyon = ridgedA(n*5.0 + SO + w*0.3, min(oct, 7.0));
      albedo = mix(vec3(0.78,0.52,0.30), vec3(0.62,0.36,0.20), smoothstep(-0.2, 0.4, h));
      albedo = mix(albedo, vec3(0.86,0.72,0.52), smoothstep(0.35, 0.65, 0.5 + 0.5*fbmA(n*3.0 + SO + 5.0, 4.0)));
      albedo = mix(albedo, vec3(0.36,0.17,0.10), smoothstep(0.72, 0.95, canyon)*0.85);
      float dunes = 0.5 + 0.5*sin(dot(n, normalize(vec3(0.7, 0.2, 0.68)))*900.0 + w.x*25.0);
      albedo *= mix(1.0, 0.8 + 0.3*dunes, clamp(oct - 5.5, 0.0, 1.0));
      if(e < 0.0){ albedo = mix(vec3(0.9,0.88,0.82), vec3(0.12,0.22,0.3), smoothstep(0.0, 0.06, -e)); ocean = smoothstep(0.02, 0.08, -e); }
      albedo *= mix(1.0, 0.85 + 0.3*grain, micro);
      relief = 1.0;
    } else if(uKind < 3.5){
      /* monde glacé : banquise fracturée, inlandsis, crevasses */
      float cracks = ridgedA(n*11.0 + SO, min(oct, 8.0));
      if(e < 0.0){
        albedo = mix(vec3(0.72,0.84,0.93), vec3(0.42,0.6,0.76), smoothstep(0.0, 0.3, -e));
        albedo = mix(albedo, vec3(0.08,0.2,0.34), smoothstep(0.8, 0.98, cracks)*0.8);
        ocean = 0.35;
      } else {
        albedo = mix(vec3(0.93,0.96,1.0), vec3(0.76,0.84,0.94), smoothstep(0.0, 0.3, mtn));
        albedo = mix(albedo, vec3(0.3,0.3,0.33), smoothstep(0.28, 0.5, e)*0.7);
        albedo = mix(albedo, vec3(0.45,0.62,0.8), smoothstep(0.85, 0.98, cracks)*0.5);
      }
      albedo *= mix(1.0, 0.9 + 0.2*grain, micro);
      relief = 0.8;
    } else {
      /* monde volcanique : basalte, coulées de lave incandescentes */
      float flows = ridgedA(n*4.5 + SO + vec3(snoise(n*3.0 + SO))*0.4, min(oct, 8.0));
      albedo = mix(vec3(0.1,0.08,0.07), vec3(0.3,0.2,0.15), smoothstep(-0.2, 0.5, h));
      albedo *= mix(1.0, 0.75 + 0.5*grain, micro);
      float lava = smoothstep(0.5, 0.72, flows) * (0.75 + 0.25*sin(uTime*1.3 + flows*30.0));
      emissive = lava; emisCol = mix(vec3(1.0,0.25,0.03), vec3(1.0,0.75,0.25), lava);
      albedo = mix(albedo, vec3(0.3,0.08,0.02), lava);
      relief = 1.2;
    }
    /* relief : dérivée directionnelle de la hauteur dans la direction de l'étoile (ombrage des montagnes) */
    vec3 lt = uLightObj - n*dot(uLightObj, n); float ltl = length(lt);
    if(relief > 0.0 && ltl > 1e-3 && ndl > -0.2){
      float eps = max(fp*2.5, 0.00035);
      float m2; float h2 = terrain(normalize(n + lt/ltl*eps), min(oct, 8.0), m2);
      float s = (h2 - h)/eps * 0.018 * relief * step(0.0, e);
      slopeLit = (ndl - s*ltl)/sqrt(1.0 + s*s);
    }
  }

  float day = max(slopeLit, 0.0);
  /* ombre des nuages de la couche basse, projetée dans la direction de l'étoile */
  float cshadow = 0.0;
  if(uCover > 0.01 && ndl > -0.1){
    vec3 sp = normalize(n + uLightObj*(0.012/max(dot(n, uLightObj), 0.2)));
    cshadow = cloudDensity(rotY(sp, uShadowRot), 0.0, min(octFor(5.5, fp), 5.0), uTime)*0.62;
  }
  vec3 col = albedo*sun*day*(1.0 - cshadow) + albedo*vec3(0.03, 0.034, 0.045);
  /* océan : reflet spéculaire du soleil, ondulé de près, et reflet du ciel en incidence rasante */
  if(ocean > 0.0){
    vec3 Hh = normalize(L + V);
    vec3 Nw = N;
    if(oct > 5.0){ vec3 wv = vec3(snoise(n*420.0 + SO + uTime*0.05), snoise(n*420.0 + SO + 7.0 - uTime*0.04), snoise(n*420.0 + SO + 3.0)); Nw = normalize(N + wv*0.05*clamp(oct - 5.0, 0.0, 1.0)); }
    float nh = max(dot(Nw, Hh), 0.0);
    float spec = pow(nh, 240.0)*2.2 + pow(nh, 36.0)*0.18;
    col += sun*spec*ocean*smoothstep(0.0, 0.1, ndl)*(1.0 - cshadow);
    float fr = pow(1.0 - mu, 5.0);
    col += uAtmoCol*fr*0.35*ocean*smoothstep(-0.1, 0.3, ndl)*uHasAtmo;
  }
  /* nuit : lumières des villes, regroupées sur les côtes et les plaines tempérées */
  float night = smoothstep(0.06, -0.18, ndl);
  if(uCities > 0.5 && uKind < 1.5 && e > 0.0 && night > 0.0){
    float coast = 1.0 - smoothstep(0.0, 0.1, e);
    float cl = fbmA(n*12.0 + SO + 5.0, clamp(oct - 1.0, 1.0, 4.0));
    float dens = smoothstep(0.1, 0.5, cl + coast*0.35 - smoothstep(0.25, 0.05, temp)*0.6);
    float pts = mix(1.0, smoothstep(0.35, 0.85, 0.5 + 0.5*snoise(n*320.0 + SO)), clamp(oct - 4.0, 0.0, 1.0));
    col += vec3(1.0,0.76,0.4)*dens*pts*night*1.3*(1.0 - cshadow*0.7);
  }
  col += emisCol*emissive*(0.9 + 1.2*night);
  /* brume atmosphérique vers le limbe (perspective aérienne) */
  if(uHasAtmo > 0.5){
    float hz = pow(1.0 - mu, 2.2)*0.6;
    col = mix(col, uAtmoCol*smoothstep(-0.25, 0.45, ndl)*0.9, hz);
    col += uAtmoCol*pow(1.0 - mu, 4.0)*0.05*night;   /* lueur nocturne (airglow) */
  } else if(uKind > 4.5){
    col *= 0.55 + 0.45*pow(mu, 0.5);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- couches de nuages ---------- */
const CLOUD_FRAG = `
precision highp float;
varying vec3 vObjNormal; varying vec3 vWorldNormal; varying vec3 vWorldPos;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform vec3 uLightObj;
uniform float uLayer; uniform float uTime; uniform float uRadius; uniform float uPixAng; uniform float uOpacity;
${NOISE}
${CLOUDS}
void main(){
  vec3 n = normalize(vObjNormal);
  vec3 N = normalize(vWorldNormal), L = normalize(uLightDir), V = normalize(cameraPosition - vWorldPos);
  float fp = length(cameraPosition - vWorldPos)*uPixAng/uRadius;
  float base = uLayer < 0.5 ? 5.5 : (uLayer < 1.5 ? 5.5 : 16.0);
  float oct = min(octFor(base, fp), uLayer < 1.5 ? 9.0 : 7.0);
  float d = cloudDensity(n, uLayer, oct, uTime);
  if(d < 0.004) discard;
  float ndl = dot(N, L);
  /* épaisseur : la densité vers l'étoile assombrit la face opposée (volume apparent) */
  float d2 = cloudDensity(normalize(n + uLightObj*0.018), uLayer, min(oct, 5.0), uTime);
  float shade = clamp(1.05 - (d2 - d)*0.9 - d*0.18, 0.45, 1.1);
  float day = smoothstep(-0.14, 0.3, ndl);
  vec3 sunC = uLightColor*mix(vec3(1.0, 0.52, 0.3), vec3(1.0), smoothstep(0.0, 0.32, ndl));
  vec3 col = sunC*day*shade*(uLayer > 1.5 ? 1.05 : 0.98) + vec3(0.02, 0.025, 0.04);
  float mu = max(dot(N, V), 0.0);
  float a = d*uOpacity*(0.55 + 0.45*smoothstep(0.0, 0.25, mu));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

/* ---------- atmosphère à diffusion simple ---------- */
const ATM_VERT = `varying vec3 vWorldPos; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
const ATM_FRAG = `
precision highp float;
varying vec3 vWorldPos;
uniform vec3 uCenter; uniform float uRp; uniform float uRa; uniform vec3 uLightDir; uniform vec3 uRay; uniform vec3 uSunset; uniform float uStrength; uniform vec3 uLightColor;
vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r){ vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r*r; float h = b*b - cc; if(h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
void main(){
  vec3 ro = cameraPosition, rd = normalize(vWorldPos - ro);
  vec2 ta = raySphere(ro, rd, uCenter, uRa);
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  vec2 tp = raySphere(ro, rd, uCenter, uRp);
  if(tp.x > 0.0) t1 = min(t1, tp.x);
  if(t1 <= t0) discard;
  float seg = (t1 - t0)/8.0, od = 0.0, H = uRa - uRp;
  vec3 L = normalize(uLightDir), acc = vec3(0.0);
  for(int i = 0; i < 8; i++){
    vec3 p = ro + rd*(t0 + seg*(float(i) + 0.5));
    vec3 nr = p - uCenter; float r = length(nr); nr /= r;
    float dens = exp(-clamp((r - uRp)/H, 0.0, 1.0)*4.2);
    float m = dot(nr, L);
    float lit = smoothstep(-0.14, 0.12, m);
    vec3 c = mix(uSunset*0.55, uRay, smoothstep(-0.02, 0.3, m));
    od += dens*seg/H;
    acc += c*dens*lit*seg*exp(-od*0.35);
  }
  float cth = dot(rd, L);
  float phase = 0.75*(1.0 + cth*cth) + 0.9*pow(max(cth, 0.0), 12.0);
  vec3 col = acc/H*uStrength*phase*uLightColor;
  col = vec3(1.0) - exp(-col);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- aurores polaires : rideaux lumineux sur les ovales magnétiques ---------- */
const AUR_VERT = `
attribute vec2 aUV;
uniform float uR; uniform float uColat; uniform float uTime; uniform float uSeed; uniform float uPole; uniform float uH0; uniform float uH1;
varying float vH; varying float vU; varying vec3 vDirW;
void main(){
  float phi = aUV.x*6.2831853;
  /* plis du rideau : ondulations lentes à plusieurs échelles qui glissent le long de l'ovale */
  float fold = 0.05*sin(phi*3.0 + uTime*0.13 + uSeed) + 0.028*sin(phi*7.0 - uTime*0.29 + uSeed*2.1)
             + 0.012*sin(phi*19.0 + uTime*0.7 + uSeed*3.3) + 0.005*sin(phi*53.0 - uTime*1.6);
  float colat = uColat + fold - aUV.y*0.014;              /* le sommet penche vers le pôle */
  vec3 dir = vec3(sin(colat)*cos(phi), uPole*cos(colat), sin(colat)*sin(phi));
  vH = aUV.y; vU = aUV.x;
  vDirW = normalize(mat3(modelMatrix)*dir);
  gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(dir*uR*(1.0 + mix(uH0, uH1, aUV.y)), 1.0);
}`;
const AUR_FRAG = `
precision highp float;
uniform vec3 uLightDir; uniform float uTime; uniform float uSeed; uniform float uIntensity; uniform vec3 uLow; uniform vec3 uHigh;
varying float vH; varying float vU; varying vec3 vDirW;
float h1(float x){ return fract(sin(x*127.1 + 311.7)*43758.5453); }
float n1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f); return mix(h1(i), h1(i + 1.0), f); }
void main(){
  /* rayons verticaux qui scintillent et défilent */
  float rays = 0.55*n1(vU*380.0 + uTime*1.1 + uSeed) + 0.3*n1(vU*1150.0 - uTime*2.3 + uSeed*2.0) + 0.15*n1(vU*3100.0 + uTime*4.0);
  rays = pow(rays, 1.5);
  /* arcs qui s'allument, se déplacent et s'éteignent le long de l'ovale */
  float band = smoothstep(0.3, 0.85, n1(vU*14.0 - uTime*0.06 + uSeed*3.0))*0.75 + 0.25*smoothstep(0.4, 0.9, n1(vU*41.0 + uTime*0.15 + uSeed));
  /* profil vertical : bord inférieur net et lumineux, décroissance vers le haut */
  float h = vH;
  float prof = smoothstep(0.0, 0.045, h)*(exp(-h*2.4) + 0.9*exp(-h*h*400.0));
  vec3 col = mix(uLow, uHigh, smoothstep(0.3, 0.95, h));
  col += vec3(0.6, 1.0, 0.8)*exp(-h*h*900.0)*0.6;         /* liseré inférieur plus blanc */
  float dark = smoothstep(0.18, -0.22, dot(vDirW, normalize(uLightDir)));
  float a = 1.7*prof*(0.3 + 0.7*rays)*(0.25 + 0.75*band)*uIntensity*(0.1 + 0.9*dark);
  gl_FragColor = vec4(col*a, 1.0);
}`;
function auroraGeometry(N, M){
  const uv = new Float32Array((N+1)*(M+1)*2), pos = new Float32Array((N+1)*(M+1)*3), idx = [];
  for(let i=0;i<=N;i++) for(let j=0;j<=M;j++){ const k = i*(M+1) + j; uv[k*2] = i/N; uv[k*2+1] = j/M; }
  for(let i=0;i<N;i++) for(let j=0;j<M;j++){ const a = i*(M+1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
let AUR_GEO = null;
const AURORA_ALL = new URLSearchParams(location.search).get('aurora') === 'all';
const KIND_ID = { ocean:0, continental:1, desert:2, ice:3, volcanic:4, gas:5 };
const COVER = { ocean:.4, continental:.33, desert:.07, ice:.22, volcanic:0, gas:0 };
const ATMO = {
  ocean:       { ray:[.28,.52,1.0], sunset:[1.0,.42,.18], k:1.25 },
  continental: { ray:[.30,.54,1.0], sunset:[1.0,.44,.2],  k:1.2 },
  desert:      { ray:[.85,.62,.42], sunset:[1.0,.4,.2],   k:.9 },
  ice:         { ray:[.55,.78,1.0], sunset:[1.0,.6,.4],   k:1.0 },
  gas:         { ray:[.92,.82,.66], sunset:[1.0,.5,.3],   k:.8 }
};
function prng(seed){ let a = (seed*2654435761)>>>0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
function randDir(r){ const z = r()*2 - 1, a = r()*Math.PI*2, s = Math.sqrt(1 - z*z); return new THREE.Vector3(Math.cos(a)*s, z*.75, Math.sin(a)*s).normalize(); }

/* ---------- application à une planète générée par le jeu ---------- */
PL.enhance = function(p){
  if(!p.mesh || p.__enhanced) return; p.__enhanced = true;
  const key = p.kind.key, grp = p.mesh.parent, R = p.radius, r = prng(Math.floor(p.seedNoise*1000) + 7);
  // sphère haute définition (silhouette lisse en gros plan)
  p.mesh.geometry.dispose(); p.mesh.geometry = new THREE.SphereGeometry(R, 64, 48);   /* v2.16 : sphère légère d'abord, pleine définition à l'approche (PL.lod) */
  const cover = (COVER[key] || 0)*(0.8 + .4*r());
  const cyc = () => { const d = randDir(r); return new THREE.Vector4(d.x, d.y, d.z, (r() < .5 ? -1 : 1)*(d.y > 0 ? 1 : -1)*(.7 + .6*r())); };
  const shared = { uCyc1:{value:cyc()}, uCyc2:{value:cyc()}, uCover:{value:cover}, uCSeed:{value:p.seedNoise*.37 + 11} };
  const atmo = ATMO[key];
  const atmoCol = atmo ? new THREE.Color(atmo.ray[0], atmo.ray[1], atmo.ray[2]) : new THREE.Color(0,0,0);
  const old = p.mesh.material;
  p.mesh.material = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uLightDir:{value:new THREE.Vector3(1,0,0)}, uLightColor:{value:new THREE.Color(1,1,1)}, uLightObj:{value:new THREE.Vector3(1,0,0)}, uAtmoCol:{value:atmoCol},
      uOceanFrac:{value:p.oceanFrac}, uSeed:{value:(p.seedNoise % 97) + 3}, uHue:{value:p.hueShift}, uTime:{value:0}, uKind:{value:KIND_ID[key]},
      uRadius:{value:R}, uPixAng:PIX, uCities:{value:(p.isHabitable || r() < .3) ? 1 : 0}, uShadowRot:{value:0}, uHasAtmo:{value:p.hasAtmosphere ? 1 : 0},
      uGas:{value:p.kind.gas?1:0}, uIcy:{value:p.kind.icy?1:0}, uVolcanic:{value:p.kind.volcanic?1:0}
    }, shared),
    vertexShader: SURF_VERT, fragmentShader: SURF_FRAG
  });
  old.dispose();
  // ancienne coque d'atmosphère du jeu → remplacée par la diffusion
  grp.children.slice().forEach(c => { if(c.material && c.material.fragmentShader === ATMO_FRAG){ grp.remove(c); c.geometry.dispose(); c.material.dispose(); } });
  p.fx = { clouds: [], atm: null, shared, hi:false, geos:[p.mesh.geometry] };
  p.mesh.userData.plfx = p.fx;
  if(p.hasAtmosphere && atmo){
    const Ra = R*(key === 'gas' ? 1.035 : 1.06);
    const m = new THREE.Mesh(new THREE.SphereGeometry(Ra, 96, 72), new THREE.ShaderMaterial({
      uniforms: { uCenter:{value:new THREE.Vector3()}, uRp:{value:R*0.999}, uRa:{value:Ra}, uLightDir:{value:new THREE.Vector3(1,0,0)}, uLightColor:{value:new THREE.Color(1,1,1)},
        uRay:{value:new THREE.Vector3(...atmo.ray)}, uSunset:{value:new THREE.Vector3(...atmo.sunset)}, uStrength:{value:atmo.k} },
      vertexShader: ATM_VERT, fragmentShader: ATM_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.FrontSide }));
    m.renderOrder = 4; grp.add(m); p.fx.atm = m;
  }
  if(cover > 0.02){
    const layers = [ { l:0, h:1.006, op:.95, drift:.0 }, { l:1, h:1.013, op:.6, drift:.0035*(r() < .5 ? -1 : 1) }, { l:2, h:1.022, op:.65, drift:.007*(r() < .5 ? -1 : 1) } ];
    layers.forEach(L => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R*L.h, 48, 36), new THREE.ShaderMaterial({
        uniforms: Object.assign({ uLightDir:{value:new THREE.Vector3(1,0,0)}, uLightColor:{value:new THREE.Color(1,1,1)}, uLightObj:{value:new THREE.Vector3(1,0,0)},
          uLayer:{value:L.l}, uTime:{value:0}, uRadius:{value:R}, uPixAng:PIX, uOpacity:{value:L.op} }, shared),
        vertexShader: SURF_VERT, fragmentShader: CLOUD_FRAG, transparent:true, depthWrite:false }));
      m.renderOrder = 1 + L.l; m.rotation.y = r()*6.28; grp.add(m);
      p.fx.geos.push(m.geometry);
      p.fx.clouds.push({ mesh:m, drift:L.drift + .0025*(L.l + 1)*(r() - .5), base:m.rotation.y, h:L.h });
    });
  }
  // aurores : sur une partie des planètes à atmosphère (plus fréquentes sur les mondes habités et glacés)
  const auChance = key === 'gas' ? .35 : (p.isHabitable ? .65 : (key === 'ice' ? .6 : .4));
  p.fx.aurora = [];
  if(p.hasAtmosphere && (AURORA_ALL || r() < auChance)){
    if(!AUR_GEO) AUR_GEO = auroraGeometry(900, 18);
    const hue = r(), low = hue < .7 ? [.2, 1.0, .5] : (hue < .85 ? [.3, .75, 1.0] : [.95, .35, .75]), high = hue < .7 ? [.95, .22, .5] : [.6, .3, 1.0];
    const tilt = new THREE.Euler((r() - .5)*.28, 0, (r() - .5)*.28);
    [1, -1].forEach(pole => [0, 1].forEach(k => {
      const m = new THREE.Mesh(AUR_GEO, new THREE.ShaderMaterial({
        uniforms: { uR:{value:R}, uColat:{value:(key === 'gas' ? .22 : .3) + k*.055 + r()*.03}, uTime:{value:0}, uSeed:{value:r()*100}, uPole:{value:pole},
          uH0:{value:key === 'gas' ? .008 : .012}, uH1:{value:key === 'gas' ? .05 : .065 - k*.012}, uLightDir:{value:new THREE.Vector3(1,0,0)},
          uIntensity:{value:(k ? .55 : 1)*(.9 + .5*r())}, uLow:{value:new THREE.Vector3(...low)}, uHigh:{value:new THREE.Vector3(...high)} },
        vertexShader: AUR_VERT, fragmentShader: AUR_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }));
      m.rotation.copy(tilt); m.frustumCulled = false; m.renderOrder = 5; m.userData.astShared = false; m.userData.auroraGeoShared = true;
      grp.add(m); p.fx.aurora.push({ mesh:m, pole, colat:m.material.uniforms.uColat.value });
    }));
  }
};

/* ---------- mise à jour par image ---------- */
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const _sun = new THREE.Color(), _white = new THREE.Color(1,1,1);
PL.update = function(p, starPos, sunColor0, T, camPos){
  if(!p.fx) return;
  const sunColor = _sun.copy(sunColor0).lerp(_white, .45);
  const L = _v.copy(starPos).sub(p.position).normalize();
  const u = p.mesh.material.uniforms;
  u.uLightDir.value.copy(L); u.uLightColor.value.copy(sunColor); u.uTime.value = T;
  p.mesh.getWorldQuaternion(_q); u.uLightObj.value.copy(L).applyQuaternion(_q.invert());
  const spin = p.mesh.rotation.y;
  p.fx.clouds.forEach((c, i) => {
    c.mesh.rotation.y = spin + c.base + c.drift*T;          // chaque couche dérive à sa propre vitesse (parallaxe entre couches)
    const cu = c.mesh.material.uniforms;
    cu.uLightDir.value.copy(L); cu.uLightColor.value.copy(sunColor); cu.uTime.value = T;
    c.mesh.getWorldQuaternion(_q); cu.uLightObj.value.copy(L).applyQuaternion(_q.invert());
    if(i === 0) u.uShadowRot.value = spin - c.mesh.rotation.y;
  });
  p.fx.aurora.forEach(a => { const au = a.mesh.material.uniforms; au.uTime.value = T; au.uLightDir.value.copy(L); });
  if(p.fx.atm){
    const au = p.fx.atm.material.uniforms;
    p.fx.atm.getWorldPosition(au.uCenter.value);
    au.uLightDir.value.copy(L); au.uLightColor.value.copy(sunColor);
    const inside = camPos.distanceTo(au.uCenter.value) < au.uRa.value*1.002;
    p.fx.atm.material.side = inside ? THREE.BackSide : THREE.FrontSide;
    au.uCenter.value.sub(camera.position);                 /* L2.1 : rendu en origine flottante — centre relatif à la caméra */
  }
};
PL.setPixelAngle = function(fovDeg, heightPx){ PIX.value = 2*Math.tan(fovDeg*Math.PI/360)/Math.max(1, heightPx); };

/* ---------- v2.16 : détail géométrique selon la taille à l'écran ----------
   La démo filme un système à la fois ; le jeu en garde jusqu'à quatre
   construits. En pleine définition partout (≈ 250 000 triangles et cinq
   passes transparentes par planète), ce serait plusieurs millions de
   triangles. Sphères légères au loin, définition de la démo de près ;
   nuages, aurores et atmosphère masqués quand la planète n'est qu'un point. */
const LOD_HI = 110, LOD_LO = 80;       /* rayon apparent en pixels : montée / redescente (hystérésis) */
let lodBudget = 1;                      /* au plus une montée en définition par image : pas d'à-coup */
const _wp = new THREE.Vector3();
PL.lodFrame = function(){ lodBudget = 1; };
PL.lod = function(p, camPos){
  const fx = p.fx; if(!fx) return;
  p.mesh.getWorldPosition(_wp);
  const px = p.radius/Math.max(1e-3, camPos.distanceTo(_wp))/PIX.value;
  fx.clouds.forEach(c => { c.mesh.visible = px > 6; });
  (fx.aurora || []).forEach(a => { a.mesh.visible = px > 40; });
  if(fx.atm) fx.atm.visible = px > 2;
  const want = fx.hi ? px > LOD_LO : px > LOD_HI;
  if(want === fx.hi) return;
  if(want){
    if(lodBudget <= 0) return;
    lodBudget--;
    if(!fx.hiGeo){
      fx.loGeo = { surf:p.mesh.geometry, clouds:fx.clouds.map(c => c.mesh.geometry) };
      fx.hiGeo = { surf:new THREE.SphereGeometry(p.radius, 192, 144), clouds:fx.clouds.map(c => new THREE.SphereGeometry(p.radius*c.h, 176, 132)) };
      fx.geos.push(fx.hiGeo.surf, ...fx.hiGeo.clouds);
    }
    p.mesh.geometry = fx.hiGeo.surf; fx.clouds.forEach((c, i) => { c.mesh.geometry = fx.hiGeo.clouds[i]; });
  } else {
    p.mesh.geometry = fx.loGeo.surf; fx.clouds.forEach((c, i) => { c.mesh.geometry = fx.loGeo.clouds[i]; });
  }
  fx.hi = want;
};
/* libération d'un système : toutes les définitions créées, attachées ou non */
PL.release = function(group){
  group.traverse(o => { const fx = o.userData && o.userData.plfx; if(fx){ fx.geos.forEach(g => g.dispose()); fx.geos = []; } });
};
})();

