/* =========================================================================
   5 ter. VAISSEAUX ET STATIONS MODULAIRES — compositions du « Chantier naval STT »
   Les 13 modules Blender (bibliothèque glTF compressée par scripts/build_game_pack.py, embarquée par build.py
   dans <script id="sttPack">) sont assemblés à l'exécution d'après des fichiers stt-composition :
   - src/data/compositions/*.json (embarqués au build) et les créations importées dans le hangar (navigateur) ;
   - un vaisseau devient un modèle de SHIPGEN.MODELS comme les autres (id « mod_… ») : écran de choix, chantier
     naval, missions, navettes, usure ; panaches Epstein du jeu sur VFX_PROP_MAIN_EXHAUST, RCS, feux de position,
     anneaux et générateur de saut autour du module de propulsion ;
   - une station devient le 4ᵉ archétype de port orbital (« modular », 20n) : postes d'amarrage = ses anneaux.
   Règle d'accouplement (note d'intégration §4) : enfant = Ps·RotX(π)·RotY(roulis)·inv(socket). Le glTF a le nez
   en +Z, le jeu en −Z : la coque est tournée de 180° autour de Y. Unités : mètres (= échelle réelle du jeu).
   Chargement : la bibliothèque est décodée une fois (asynchrone, meshopt), puis tout assemblage est synchrone.
   Géométries, matériaux et textures des prototypes sont partagés : MODSHIP.keeps(x) les protège de dispose().
   ========================================================================= */
const MODSHIP = (function(){
const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const RX = new M4().makeRotationX(Math.PI), FLIP = new M4().makeRotationY(Math.PI);
const C = new M4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1), Ci = C.clone().invert();   /* axes Blender → glTF */
const ST = { ready: false, settled: false, failed: null, protos: {}, cont: null, clips: {}, fleet: null, img: {}, ships: [], stations: [] };
const KEEP = new WeakSet(), keep = (x) => { if(x) KEEP.add(x); return x; };
const LS_KEY = 'stt.game.compositions.v1';
const FAMILY = {
  fret:        { group: 'Fret modulaire', arch: 'Cargo modulaire' },
  passagers:   { group: 'Passagers',      arch: 'Paquebot modulaire' },
  vrac:        { group: 'Fret en vrac',   arch: 'Citernier modulaire' },
  independant: { group: 'Indépendants',   arch: 'Indépendant modulaire' },
  pousseur:    { group: 'Pousseurs',      arch: 'Pousseur modulaire' }
};
const PAX = { PAX: 48, SHUTTLE: 8 }, TANK_M3 = 840, CONT_T = 6.5;
const waiters = [];
let onChange = null;

/* ---------- pack embarqué ---------- */
function readPack(){
  const el = document.getElementById('sttPack'); if(!el) return null;
  try { const d = JSON.parse(el.textContent); el.textContent = ''; el.parentNode && el.parentNode.removeChild(el); return d; }
  catch(e){ console.warn('[modulaire] pack illisible', e); return null; }
}
function b64buf(s){ const bin = atob(s), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function loadImg(b64){ return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/webp;base64,' + b64; }); }
const fontsReady = () => (document.fonts && document.fonts.load)
  ? Promise.race([Promise.all([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('600 60px "Barlow Condensed"')]).catch(() => 0), new Promise(r => setTimeout(r, 2500))])
  : Promise.resolve();

function init(){
  const pack = readPack();
  if(!pack || !THREE.GLTFLoader){ settle(false); return; }
  ST.fleet = pack.fleet || { companies: {}, container_brands: {}, zones: {} };
  const imgs = Promise.all(Object.keys(pack.img || {}).map(k => loadImg(pack.img[k]).then(im => { ST.img[k] = im; })));
  const glb = b64buf(pack.glb); pack.glb = null;
  const gltf = new Promise((res, rej) => {
    const L = new THREE.GLTFLoader();
    if(typeof MeshoptDecoder !== 'undefined') L.setMeshoptDecoder(MeshoptDecoder);
    L.parse(glb, '', res, rej);
  });
  Promise.all([gltf, imgs, fontsReady()]).then(([g]) => {
    setup(g);
    (pack.comps || []).forEach(c => add(c, { builtIn: true }));
    stored().forEach(c => add(c, { imported: true }));
    ST.ready = true; settle(true);
  }).catch(e => { ST.failed = e; console.warn('[modulaire] bibliothèque non chargée', e); settle(false); });
}
function settle(ok){ ST.settled = true; waiters.splice(0).forEach(f => { try { f(ok); } catch(e){ console.warn(e); } }); }
function whenReady(f){ if(ST.settled) f(ST.ready); else waiters.push(f); }

function setup(g){
  g.scene.updateMatrixWorld(true);
  g.scene.children.forEach(c => { const m = /^STT_(.+)_ROOT$/.exec(c.name); if(m) ST.protos[m[1]] = c; else if(c.name === 'STT_CARGO_Container_A') ST.cont = c; });
  g.animations.forEach(a => { ST.clips[a.name] = a; });
  g.scene.traverse(o => { if(o.isMesh) fixMat(o.material); });
}
/* matériaux glTF : déjà linéaires (linearize() du générateur ne doit pas les reconvertir) ; intensité émissive
   KHR_materials_emissive_strength (ignorée par r128) reportée à la main ; textures partagées protégées */
const TEX_SLOTS = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'];
function fixMat(m){
  if(!m || m.userData.modFixed) return;
  m.userData.modFixed = true; m.userData.lin = true; keep(m);
  const ext = m.userData.gltfExtensions;
  if(ext && ext.KHR_materials_emissive_strength) m.emissiveIntensity = ext.KHR_materials_emissive_strength.emissiveStrength;
  TEX_SLOTS.forEach(k => { if(m[k]){ keep(m[k]); m[k].anisotropy = Math.max(m[k].anisotropy || 1, 4); } });
}

/* ---------- prototypes fusionnés par matériau (comme l'éditeur) ---------- */
const DYNAMIC = /SolarGimbal|Radiator_|DoorMech|DoorField|Nozzle|_Int_/;
const optCache = new Map();
const relMatrix = (root, node) => new M4().copy(root.matrixWorld).invert().multiply(node.matrixWorld);
function normScale(arr, normalized){
  if(!normalized) return 1;
  return arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : 1;
}
/* fusion de géométries (attributs quantifiés relus en flottants : positions entières + transformation de nœud,
   normales normalisées sur 8 bits) — r128 ne dénormalise pas getX() */
function mergeInto(list, shared){
  const names = ['position', 'normal', 'uv', 'uv2'].filter(n => list.every(e => e.geo.attributes[n]));
  let nv = 0, ni = 0;
  list.forEach(e => { const c = e.geo.attributes.position.count; nv += c; ni += e.geo.index ? e.geo.index.count : c; });
  const out = {}; names.forEach(n => { out[n] = new Float32Array(nv*(n === 'uv' || n === 'uv2' ? 2 : 3)); });
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), v = new V3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  list.forEach(({ geo, M }) => {
    nm.getNormalMatrix(M); const cnt = geo.attributes.position.count, flip = M.determinant() < 0;
    names.forEach(n => {
      const a = geo.attributes[n], s = normScale(a.array || (a.data && a.data.array), a.normalized), d = out[n];
      if(n === 'uv' || n === 'uv2'){ for(let i = 0; i < cnt; i++){ d[(vo + i)*2] = a.getX(i)/s; d[(vo + i)*2 + 1] = a.getY(i)/s; } return; }
      for(let i = 0; i < cnt; i++){
        v.set(Math.max(a.getX(i)/s, -1e9), Math.max(a.getY(i)/s, -1e9), Math.max(a.getZ(i)/s, -1e9));
        if(n === 'position') v.applyMatrix4(M); else v.applyMatrix3(nm).normalize();
        d[(vo + i)*3] = v.x; d[(vo + i)*3 + 1] = v.y; d[(vo + i)*3 + 2] = v.z;
      }
    });
    if(geo.index){ const ix = geo.index; for(let i = 0; i < ix.count; i += 3){ const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
      idx[io + i] = a + vo; idx[io + i + 1] = (flip ? c : b) + vo; idx[io + i + 2] = (flip ? b : c) + vo; } io += ix.count; }
    else { for(let i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt; }
    vo += cnt;
  });
  const g = new THREE.BufferGeometry();
  names.forEach(n => g.setAttribute(n, new THREE.BufferAttribute(out[n], n === 'uv' || n === 'uv2' ? 2 : 3)));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
  return shared === false ? g : keep(g);
}
function optimized(src, key){
  if(optCache.has(key)) return optCache.get(key);
  src.updateMatrixWorld(true);
  const inv = new M4().copy(src.matrixWorld).invert(), groups = new Map(), dyn = [];
  (function walk(o){
    if(o !== src && DYNAMIC.test(o.name)){ dyn.push(o); return; }
    if(o.isMesh){
      const k = o.material.name || o.material.uuid;
      if(!groups.has(k)) groups.set(k, { mat: o.material, list: [] });
      groups.get(k).list.push({ geo: o.geometry, M: new M4().multiplyMatrices(inv, o.matrixWorld) });
    }
    o.children.forEach(walk);
  })(src);
  const root = new THREE.Group(); root.name = src.name;
  groups.forEach((g, k) => { const m = new THREE.Mesh(mergeInto(g.list), g.mat); m.name = 'M_' + k; root.add(m); });
  dyn.forEach(o => { const c = o.clone(true); relMatrix(src, o).decompose(c.position, c.quaternion, c.scale); root.add(c);
    c.traverse(m => { if(m.isMesh) keep(m.geometry); }); });
  optCache.set(key, root); return root;
}
/* points nommés d'un module (sockets, RCS, feux, échappement), dans le repère du module */
const markCache = new Map();
function marks(key){
  if(markCache.has(key)) return markCache.get(key);
  const root = ST.protos[key], out = [];
  if(root){ root.updateMatrixWorld(true); root.traverse(o => { if(/^(SOCKET|RCS|NAVLIGHT|VFX)_/.test(o.name)) out.push({ name: o.name, M: relMatrix(root, o) }); }); }
  markCache.set(key, out); return out;
}
const sockCache = new Map();
function socketLocal(key, port){
  const k = key + '.' + port;
  if(!sockCache.has(k)){ const m = marks(key).find(x => x.name === 'SOCKET_' + key + '_' + port); if(!m) throw new Error('socket ' + k + ' introuvable'); sockCache.set(k, m.M); }
  return sockCache.get(k);
}
function mate(Ps, key, port, roll){
  return new M4().multiplyMatrices(Ps, RX).multiply(new M4().makeRotationY((roll || 0)*Math.PI/180)).multiply(socketLocal(key, port).clone().invert());
}
const portsOf = (key) => marks(key).filter(m => m.name.startsWith('SOCKET_' + key + '_') && !/CONTAINER/.test(m.name)).map(m => m.name.slice(('SOCKET_' + key + '_').length));
const massOf = (key) => (ST.protos[key] && ST.protos[key].userData.stt_mass_t) || 50;

/* ---------- compagnies, livrées, décals (même gabarit que l'éditeur et gen_fleet_decals.py) ---------- */
const DARK = 'rgb(32,34,38)', LIGHT = 'rgb(236,236,232)';
const RECTS = { logo_dark: [0, 0, 1024, 512], logo_light: [1024, 0, 2048, 512], reg_dark: [0, 512, 1024, 768], reg_light: [1024, 512, 2048, 768] };
const FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c/12.92 : Math.pow((c + 0.055)/1.055, 2.4); };
const linToHex = (c) => '#' + c.map(v => { const s = v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(v, 1/2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, s))*255).toString(16).padStart(2, '0'); }).join('');
function finalizeCompany(key, d){
  const h = /^#[0-9a-f]{6}$/i.test(d.livery_hex || '') ? d.livery_hex : '#7b3fb3';
  const rgb = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), linC = rgb.map(srgbToLin);
  return { key, custom: true, name: d.name || key, mark: (d.mark || key).toUpperCase(), tagline: (d.tagline || d.name || '').toUpperCase(), registry: (d.registry || key + '-0001').toUpperCase(),
    emblem: d.emblem || 'chevrons', livery_hex: h, livery_linear: linC, livery_dark_linear: linC.map(v => v*0.38),
    accent: 'rgb(' + rgb.map(v => Math.round(v*0.82)) + ')', accent_light: 'rgb(' + rgb.map(v => Math.round(v + (255 - v)*0.45)) + ')' };
}
function companyOf(comp, k){
  const cos = (comp && comp._cos) || {};
  return cos[k] || ST.fleet.companies[k] || ST.fleet.companies.STT;
}
function measure(g, txt){
  const m = g.measureText(txt), l = m.actualBoundingBoxLeft || 0, r = m.actualBoundingBoxRight || m.width, a = m.actualBoundingBoxAscent || 0, d = m.actualBoundingBoxDescent || 0;
  return { l, a, w: l + r, h: a + d };
}
function fitFont(g, txt, maxW, maxH, w, start){
  w = w || 800;
  for(let s = start || 320; s > 10; s -= 6){ g.font = w + ' ' + s + 'px ' + FONT; const m = measure(g, txt); if(m.w <= maxW && m.h <= maxH) return m; }
  g.font = w + ' 10px ' + FONT; return measure(g, txt);
}
function textCenter(g, r, txt, font, fill){
  g.font = font; const m = measure(g, txt); g.fillStyle = fill;
  g.fillText(txt, r[0] + (r[2] - r[0] - m.w)/2 + m.l, r[1] + (r[3] - r[1] - m.h)/2 + m.a);
}
function emblem(g, kind, cx, cy, s, fg, acc){
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const ell = (x0, y0, x1, y1, fill) => { g.beginPath(); g.ellipse((x0 + x1)/2, (y0 + y1)/2, Math.abs(x1 - x0)/2, Math.abs(y1 - y0)/2, 0, 0, Math.PI*2); g.fillStyle = fill; g.fill(); };
  const line = (x0, y0, x1, y1, col, w) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
  const P = Math.PI;
  switch(kind){
    case 'sun':
      for(let k = 0; k < 12; k++){ const a = k*P/6; poly([[cx + Math.cos(a)*s, cy + Math.sin(a)*s], [cx + Math.cos(a + 0.13)*s*0.62, cy + Math.sin(a + 0.13)*s*0.62], [cx + Math.cos(a - 0.13)*s*0.62, cy + Math.sin(a - 0.13)*s*0.62]], acc); }
      ell(cx - s*0.55, cy - s*0.55, cx + s*0.55, cy + s*0.55, acc); ell(cx - s*0.36, cy - s*0.36, cx + s*0.36, cy + s*0.36, fg); break;
    case 'bars': for(let i = 0; i < 3; i++){ const x = cx - s + i*s*0.62; poly([[x + s*0.45, cy - s], [x + s*0.85, cy - s], [x + s*0.4, cy + s], [x, cy + s]], i === 0 ? acc : fg); } break;
    case 'star': case 'star4': {
      const n = kind === 'star' ? 6 : 4, pts = [];
      for(let k = 0; k < n*2; k++){ const a = -P/2 + k*P/n, r = k % 2 === 0 ? s : s*(n === 6 ? 0.45 : 0.32); pts.push([cx + Math.cos(a)*r, cy + Math.sin(a)*r]); }
      poly(pts, acc); ell(cx - s*0.16, cy - s*0.16, cx + s*0.16, cy + s*0.16, fg); break;
    }
    case 'wing': for(let i = 0; i < 4; i++){ const y = cy - s + i*s*0.5, L = s*(2 - i*0.35); poly([[cx - s, y], [cx - s + L, y - s*0.1], [cx - s + L - s*0.25, y + s*0.32], [cx - s, y + s*0.38]], i === 0 ? acc : fg); } break;
    case 'leaf':
      ell(cx - s*0.55, cy - s, cx + s*0.55, cy + s, acc); line(cx, cy - s*0.9, cx, cy + s, fg, Math.max(3, s*0.1));
      for(let k = 0; k < 3; k++){ const yy = cy - s*0.4 + k*s*0.4; line(cx, yy + s*0.2, cx + s*0.4, yy - s*0.1, fg, Math.max(2, s*0.07)); line(cx, yy + s*0.2, cx - s*0.4, yy - s*0.1, fg, Math.max(2, s*0.07)); }
      break;
    case 'crystal': { const pts = []; for(let k = 0; k < 6; k++){ const a = -P/2 + k*P/3; pts.push([cx + Math.cos(a)*s, cy + Math.sin(a)*s]); }
      poly(pts, acc); poly([[cx, cy - s], [cx + s*0.4, cy], [cx, cy + s], [cx - s*0.4, cy]], fg); break; }
    case 'cross': { const w = s*0.36; g.fillStyle = acc; g.fillRect(cx - w, cy - s, 2*w, 2*s); g.fillRect(cx - s, cy - w, 2*s, 2*w); break; }
    case 'belt':
      for(let k = 0; k < 3; k++){ const x = cx - s*0.8 + k*s*0.8, y = cy + s*0.35 - k*s*0.35; ell(x - s*0.24, y - s*0.24, x + s*0.24, y + s*0.24, acc); }
      g.beginPath(); g.arc(cx, cy, s, 200*P/180, 340*P/180); g.strokeStyle = fg; g.lineWidth = Math.max(3, s*0.08); g.stroke(); break;
    case 'crescent':
      ell(cx - s, cy - s, cx + s, cy + s, acc);
      g.save(); g.globalCompositeOperation = 'destination-out'; ell(cx - s*0.45, cy - s*1.05, cx + s*1.35, cy + s*0.75, '#000'); g.restore(); break;
    default: for(let i = 0; i < 3; i++){ const bx = cx - s + i*s*0.55; poly([[bx, cy - s], [bx + s*0.34, cy - s], [bx + s*1.04, cy], [bx + s*0.34, cy + s], [bx, cy + s], [bx + s*0.7, cy]], i === 2 ? acc : fg); }
  }
}
function shipLogo(g, r, co, light){
  const h = r[3] - r[1], fg = light ? LIGHT : DARK, acc = light ? co.accent_light : co.accent, x0 = r[0], y0 = r[1];
  emblem(g, co.emblem, x0 + 120, y0 + h*0.42, 100, fg, acc);
  let m = fitFont(g, co.mark, 740, 300); g.fillStyle = fg;
  g.fillText(co.mark, x0 + 250 + m.l, y0 + 20 + (300 - m.h)/2 + m.a);
  m = fitFont(g, co.tagline, 740, 64, 600, 70);
  g.fillText(co.tagline, x0 + 256 + m.l, y0 + h - 110 + m.a);
}
function texLike(img, ref){
  const t = img.getContext ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  if(ref){ t.wrapS = ref.wrapS; t.wrapT = ref.wrapT; t.offset.copy(ref.offset); t.repeat.copy(ref.repeat); t.rotation = ref.rotation; t.center.copy(ref.center); t.matrixAutoUpdate = ref.matrixAutoUpdate; t.matrix.copy(ref.matrix); }
  t.needsUpdate = true; return keep(t);
}
const atlasCache = new Map();
function decalTexture(comp, coKey, reg, ref){
  const co = companyOf(comp, coKey), builtIn = !!ST.fleet.companies[coKey] && !co.custom;
  const r = String(reg || co.registry || '').toUpperCase();
  const k = coKey + '|' + r + '|' + (co.custom ? JSON.stringify([co.name, co.mark, co.tagline, co.livery_hex, co.emblem]) : '');
  if(atlasCache.has(k)) return atlasCache.get(k);
  const base = builtIn && coKey !== 'STT' ? ST.img['decals_' + coKey] : (ref && ref.image);
  let t;
  if(builtIn && r === co.registry){ t = coKey === 'STT' || !base ? ref : texLike(base, ref); }
  else {
    const S = (base && base.width) || 1024, f = S/2048, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'); if(base) g.drawImage(base, 0, 0, S, S);
    g.save(); g.scale(f, f);
    if(!builtIn){ ['logo_dark', 'logo_light'].forEach(n => { const q = RECTS[n]; g.clearRect(q[0], q[1], q[2] - q[0], q[3] - q[1]); });
      shipLogo(g, RECTS.logo_dark, co, false); shipLogo(g, RECTS.logo_light, co, true); }
    ['reg_dark', 'reg_light'].forEach(n => { const q = RECTS[n]; g.clearRect(q[0], q[1], q[2] - q[0], q[3] - q[1]); });
    textCenter(g, RECTS.reg_dark, r, '800 250px ' + FONT, DARK); textCenter(g, RECTS.reg_light, r, '800 250px ' + FONT, LIGHT);
    g.restore();
    t = texLike(cv, ref);
  }
  atlasCache.set(k, t); return t;
}
const matCache = new Map();
const lin = (c, mean) => c.map(v => Math.min(1, v/mean));
function styled(mat, style, comp){
  const n = mat.name || '';
  let kind = null;
  if(n.startsWith('STT_Livery')) kind = 'liv';
  else if(n.startsWith('STT_Decals_STT')) kind = 'dec';
  else if(n.startsWith('STT_ContDecals_')) kind = 'cdec';
  else if(n.startsWith('STT_Container_')) kind = 'cont';
  if(!kind) return mat;
  const co = companyOf(comp, style.company), cid = co.custom ? co.livery_hex + co.mark + co.emblem : '';
  let sk;
  if(kind === 'liv') sk = style.zone && ST.fleet.zones[style.zone] ? 'Z' + style.zone : 'C' + style.company + cid;
  else if(kind === 'dec') sk = style.company + '|' + (style.reg || '') + cid;
  else sk = style.brand;
  if(!sk) return mat;
  const key = n + '|' + sk;
  if(matCache.has(key)) return matCache.get(key);
  const m = keep(mat.clone());
  if(kind === 'liv'){
    const dark = n.includes('Livery_Dark'); let c;
    if(style.zone && ST.fleet.zones[style.zone]){ const z = ST.fleet.zones[style.zone].livery_linear; c = dark ? z.map(v => v*0.35) : z; }
    else c = dark ? co.livery_dark_linear : co.livery_linear;
    m.color.setRGB.apply(m.color, lin(c, 0.806));
  } else if(kind === 'dec') m.map = decalTexture(comp, style.company, style.reg, mat.map);
  else if(kind === 'cont'){ const b = ST.fleet.container_brands[style.brand]; if(b) m.color.setRGB.apply(m.color, lin(b.container_color_linear, 0.745)); }
  else if(kind === 'cdec'){ const im = ST.img['containers_' + style.brand]; if(im) m.map = texLike(im, mat.map); }
  matCache.set(key, m); return m;
}
function applyStyle(obj, style, comp){ obj.traverse(o => { if(o.isMesh) o.material = styled(o.material, style, comp); }); }

/* ---------- containers des modules CARGO / CRG6 ---------- */
function containerMatrix(key, sockG){
  const Sb = new M4().multiplyMatrices(Ci, sockG).multiply(C), p = new V3().setFromMatrixPosition(Sb);
  const e = Sb.elements, r = new V3(e[8], e[9], e[10]).normalize(), ax = new V3(0, 1, 0);
  let Y, Z; if(key === 'CARGO'){ Y = ax; Z = r; } else { Y = r; Z = ax; }
  const X = new V3().crossVectors(Y, Z).normalize();
  return new M4().multiplyMatrices(C, new M4().makeBasis(X, Y, Z).setPosition(p)).multiply(Ci);
}
const contCache = new Map();
function containerMats(key){
  if(contCache.has(key)) return contCache.get(key);
  const list = marks(key).filter(m => /^SOCKET_(CRG6_)?CONTAINER_/.test(m.name)).sort((a, b) => a.name.localeCompare(b.name)).map(m => containerMatrix(key, m.M));
  contCache.set(key, list); return list;
}

/* ---------- assemblage ---------- */
function placeModule(group, key, M, style, comp, ctx){
  const inst = optimized(ST.protos[key], key).clone(true);
  applyStyle(inst, style, comp);
  inst.matrixAutoUpdate = false; inst.matrix.copy(M); inst.userData.modKey = key;
  group.add(inst); ctx.modules.push({ key, inst, M, id: style.id });
  inst.traverse(o => { if(/_Int_/.test(o.name)) o.visible = false; });          /* intérieurs : invisibles de l'extérieur */
  if((key === 'CARGO' || key === 'CRG6') && style.containers){
    containerMats(key).forEach((Mc, i) => {
      const brand = style.containers[i]; if(!brand || !ST.fleet.container_brands[brand]) return;
      const c = optimized(ST.cont, '__CONTAINER__').clone(true); applyStyle(c, { brand }, comp);
      c.matrixAutoUpdate = false; c.matrix.copy(Mc); inst.add(c); ctx.containers++;
    });
  }
  const pose = (clip, open) => { if(!ST.clips[clip]) return; const mx = new THREE.AnimationMixer(inst), act = mx.clipAction(ST.clips[clip]);
    act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.play(); act.paused = true; act.time = open ? ST.clips[clip].duration : 0; mx.update(0); };
  if(key === 'PWR') pose('PWR_Deploy', true);                                    /* ailes solaires déployées */
  if(key === 'BAY'){
    const field = style.door === 'field';
    inst.traverse(o => { if(o.name.startsWith('STT_BAY_DoorMech')) o.visible = !field; if(o.name.startsWith('STT_BAY_DoorField')) o.visible = field; });
    if(!field) pose('BAY_DoorMech_Open', true);                                  /* portes ouvertes : les engins de baie passent */
  }
  return inst;
}
const ids = (c) => (c.parts || []).map(p => Array.isArray(p) ? { id: String(p[0]), key: p[1], opts: p[2] || {} } : { id: String(p.id), key: p.key, opts: p });
/* positions des pièces : parcours des liens dans les deux sens depuis la racine (même règle que fleet.json) */
function worldOf(comp){
  const defs = new Map(); ids(comp).forEach(p => { if(ST.protos[p.key] && !defs.has(p.id)) defs.set(p.id, p); });
  const W = new Map(), parent = new Map(); if(!defs.size) return { W, defs, parent };
  const root = comp.root != null && defs.has(String(comp.root)) ? String(comp.root) : defs.keys().next().value;
  W.set(root, new M4());
  let pending = (comp.links || []).filter(l => Array.isArray(l) && l.length >= 2), progress = true;
  while(pending.length && progress){
    progress = false; const next = [];
    pending.forEach(l => {
      const a = String(l[0]).split('.'), b = String(l[1]).split('.'), r = +l[2] || 0;
      if(!defs.has(a[0]) || !defs.has(b[0])) return;
      let src, sp, dst, dp, rr;
      if(W.has(a[0]) && !W.has(b[0])){ src = a[0]; sp = a[1]; dst = b[0]; dp = b[1]; rr = r; }
      else if(W.has(b[0]) && !W.has(a[0])){ src = b[0]; sp = b[1]; dst = a[0]; dp = a[1]; rr = -r; }
      else { if(!(W.has(a[0]) && W.has(b[0]))) next.push(l); return; }
      try { W.set(dst, mate(W.get(src).clone().multiply(socketLocal(defs.get(src).key, sp)), defs.get(dst).key, dp, rr)); parent.set(dst, src); progress = true; }
      catch(e){ console.warn('[modulaire]', e.message); }
    });
    pending = next;
  }
  return { W, defs, parent };
}
function styleFor(p, comp){
  const other = p.key === 'SHUTTLE' && p.opts.company && p.opts.company !== comp.company;
  return { id: p.id, company: other ? p.opts.company : comp.company, reg: other ? null : (comp.registry || null), zone: comp.type === 'station' ? p.opts.zone || null : null,
           door: p.opts.door || 'mech', containers: (comp.containers || {})[p.id] || null };
}
function assemble(comp){
  const ctx = { modules: [], containers: 0 }, g = new THREE.Group(), { W, defs } = worldOf(comp);
  W.forEach((M, id) => placeModule(g, defs.get(id).key, M, styleFor(defs.get(id), comp), comp, ctx));
  g.userData.modular = true;
  return { g, ctx, W, defs };
}

/* une coque assemblée = un maillage par matériau (poses fixes : ailes déployées, portes ouvertes). Vaisseau : matériaux
   par type de module (occlusion ambiante précalculée gardée). Station (flat) : matériaux de base sans l'AO par module,
   pour tenir le budget de rendu des ports (une trentaine d'appels au lieu de plusieurs centaines). */
const flatCache = new Map(), imgIds = new WeakMap();
const imgId = (t) => { if(!t || !t.image) return ''; if(!imgIds.has(t.image)) imgIds.set(t.image, imgIds.size + 1 + '_' + Math.random().toString(36).slice(2, 6));
  return imgIds.get(t.image) + '@' + t.offset.x.toFixed(3) + ',' + t.offset.y.toFixed(3) + ',' + t.repeat.x.toFixed(3) + ',' + t.repeat.y.toFixed(3); };
function flatMat(m){   /* copies par module (STT_<Nom>@<KEY>) : même image, même transformation → un seul matériau */
  const base = (m.name || '').split('@')[0], k = base + '|' + imgId(m.map) + '|' + imgId(m.normalMap) + '|' + m.color.getHexString() + '|' + (m.emissive ? m.emissive.getHexString() : '');
  if(!flatCache.has(k)){ const f = keep(m.clone()); f.aoMap = null; f.name = base; flatCache.set(k, f); }
  return flatCache.get(k);
}
function bake(g, flat){
  g.updateMatrixWorld(true);
  const inv = new M4().copy(g.matrixWorld).invert(), groups = new Map(), done = [];
  (function walk(o){
    if(!o.visible){ done.push(o); return; }                 /* intérieurs, variante de porte non retenue : retirés */
    if(o.userData.noBake) return;
    if(o.isMesh && !o.userData.noFrame){
      if(flat && /^STT_Int_/.test(o.material.name || '')){ done.push(o); return; }   /* station vue de loin : sans intérieurs */
      const mat = flat ? flatMat(o.material) : o.material;
      if(!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push({ geo: o.geometry, M: new M4().multiplyMatrices(inv, o.matrixWorld) }); done.push(o);
    }
    o.children.forEach(walk);
  })(g);
  done.forEach(o => o.parent.remove(o));
  groups.forEach((list, mat) => { const m = new THREE.Mesh(mergeInto(list, false), mat); m.name = 'B_' + (mat.name || ''); g.add(m); });
  return groups.size;
}

/* ---------- statistiques (masses des modules Blender, comme l'éditeur) ---------- */
function statsOf(comp){
  const { W, defs } = worldOf(comp); let mass = 0, cont = 0, pax = 0, tank = 0, engines = 0, pwr = 0, bays = 0;
  W.forEach((M, id) => { const p = defs.get(id), k = p.key; mass += massOf(k); pax += PAX[k] || 0; if(k === 'TANK') tank += TANK_M3; if(k === 'PROP') engines++; if(k === 'PWR') pwr++; if(k === 'BAY') bays++;
    const cs = (comp.containers || {})[id]; if(cs) cs.forEach(b => { if(b && ST.fleet.container_brands[b]){ cont++; mass += CONT_T; } }); });
  return { parts: W.size, mass: Math.round(mass), containers: cont, passengers: pax, tank_m3: tank, engines, pwr, bays };
}
function autoGame(comp, s){
  const tier = s.mass < 800 ? 'I' : s.mass < 1300 ? 'II' : s.mass < 2000 ? 'III' : 'IV';   /* masses réelles des modules : ~600 à 2 500 t */
  const family = s.containers >= 4 ? 'fret' : s.passengers >= 48 ? 'passagers' : s.tank_m3 >= 1680 ? 'vrac' : s.parts <= 4 ? 'pousseur' : 'independant';
  return { tier, family, ftl: tier === 'III' || tier === 'IV', crew: { I: 2, II: 4, III: 6, IV: 10 }[tier] };
}

/* ---------- vaisseau : coque + raccordement au générateur (contrat de SHIPGEN.build) ---------- */
function buildShip(M){
  const comp = M.comp, A = assemble(comp), hull = new THREE.Group();
  hull.matrixAutoUpdate = false; hull.matrix.copy(FLIP); hull.add(A.g);
  const g = new THREE.Group(); g.add(hull); g.updateMatrixWorld(true);
  const toG = (Mm) => new M4().multiplyMatrices(FLIP, Mm);
  const X = { stats: { engines: 0, pdc: 0, containers: A.ctx.containers, cabins: Math.round(M.paxN/2), radiators: 0, tanks: M.family === 'vrac' ? Math.round(M.tankM3/TANK_M3) : 0, rings: 0, jumpCore: 0 },
              rcs: [], tips: [], docks: [], hide: [] };
  const fx = SHIPGEN.fx, NAV = SHIPGEN.NAV, len = new THREE.Box3().setFromObject(g).getSize(new V3()).z;
  let drive = null;
  A.ctx.modules.forEach(({ key, inst, M: Mm, id }) => {
    const Wm = toG(Mm), rot = new THREE.Matrix4().extractRotation(Wm);
    if(key === 'PWR') X.stats.radiators += 2;
    const pods = {};
    marks(key).forEach(mk => {
      const W2 = new M4().multiplyMatrices(Wm, mk.M), p = new V3().setFromMatrixPosition(W2);
      if(mk.name === 'VFX_PROP_MAIN_EXHAUST'){
        const nz = inst.getObjectByName('STT_PROP_Nozzle'), dir = new V3(0, 1, 0).transformDirection(W2);
        let exitR = 2.2; if(nz){ const d = new THREE.Box3().setFromObject(nz).getSize(new V3()).toArray().sort((a, b) => a - b); exitR = Math.max(1.2, d[1]*0.45); }
        const holder = new THREE.Group(); holder.position.copy(p); holder.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir); g.add(holder);
        fx.addEpsteinDrive(holder, 0, 0, 0, exitR, Math.max(60, len*1.05), X.stats.engines*1.7 + 0.3, 1);
        X.stats.engines++;
        if(!drive){ drive = { p: p.clone(), dir: dir.clone(), M: Wm }; }
      } else if(mk.name.startsWith('RCS_')){
        const k = mk.name.split('_').slice(0, 3).join('_'); (pods[k] = pods[k] || []).push(mk);
      } else if(mk.name.startsWith('NAVLIGHT_')){
        const strobe = /STROBE/.test(mk.name), mat = strobe ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : /_PORT$/.test(mk.name) ? NAV.red : /_STBD$/.test(mk.name) ? NAV.green : NAV.white;
        const s = new THREE.Mesh(new THREE.SphereGeometry(strobe ? 0.32 : 0.36, 10, 8), mat); s.position.copy(p); s.userData.noFrame = true; g.add(s);
        if(strobe) X.tips.push(s);
      }
    });
    /* RCS : un bloc par coin (4 tuyères), jet radial dans le plan XY du vaisseau */
    Object.keys(pods).forEach(k => {
      const l = pods[k], c = new V3(); l.forEach(mk => c.add(new V3().setFromMatrixPosition(mk.M))); c.multiplyScalar(1/l.length);
      const dl = new V3(c.x, c.y, 0); if(dl.lengthSq() < 1e-4) return;
      const d = dl.normalize().applyMatrix4(rot); if(Math.abs(d.z) > 0.35) return;
      const p = c.clone().applyMatrix4(Wm), n = new V3(d.x, d.y, 0).normalize();
      X.rcs.push({ x: p.x + n.x*0.4, y: p.y + n.y*0.4, z: p.z, nx: n.x, ny: n.y });
    });
    /* baie latérale (+X du module) : ouverture 18 × 5,2 m, profondeur ~12 m — engins de baie de la navette (20p) */
    if(key === 'BAY'){
      const Cl = new V3(6.75, 0, -10.5).applyMatrix4(Wm), N = new V3(1, 0, 0).applyMatrix4(rot).normalize(), T = new V3(0, 0, -1).applyMatrix4(rot).normalize();
      const docked = A.ctx.modules.filter(o => o.key === 'SHUTTLE' && comp.links && comp.links.some(l => (String(l[0]) === id + '.SHUTTLE' && String(l[1]).startsWith(o.id + '.')) || (String(l[1]) === id + '.SHUTTLE' && String(l[0]).startsWith(o.id + '.'))));
      docked.forEach(o => { o.inst.userData.noBake = true; });
      X.docks.push({ C: Cl, N, T, B: new V3().crossVectors(N, T), hx: 9, hy: 2.6, D: 12, room: [-9, 9, -2.6, 2.6], mode: N.y < -0.7 ? 'belly' : 'side', ventral: N.y < -0.7, modBay: id,
        hide: docked.map(o => o.inst) });
    }
  });
  if(drive){
    const tail = drive.p.clone().addScaledVector(drive.dir, 4);
    fx.addDriveLight(g, tail.x, tail.y, tail.z, Math.max(60, len*1.05));
    g.userData.driveCenter = drive.p.clone(); g.userData.plumeLen = Math.max(60, len*1.05);
    /* réacteur = module de propulsion : anneaux de distorsion et générateur de saut (09) se posent autour */
    const pm = A.ctx.modules.find(o => o.key === 'PROP'), b = new THREE.Box3();
    pm.inst.traverse(o => { if(o.isMesh && o.name.startsWith('M_')){ if(!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(new M4().multiplyMatrices(toG(pm.M), new M4()))); } });
    if(!b.isEmpty()){ const s = b.getSize(new V3()); g.userData.reactor = { z0: b.min.z + s.z*0.42, len: s.z*0.5, apo: Math.min(s.x, s.y)*0.5 };   /* moitié arrière : en retrait des ailes solaires */ }
  }
  X.drawCalls = bake(A.g, false);
  const hb = new THREE.Box3().setFromObject(g);
  g.userData.dockPt = new V3(0, hb.min.y, (hb.min.z + hb.max.z)/2);
  g.userData.extern = X;
  return g;
}

/* ---------- registre des compositions ---------- */
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'composition';
function normalizeComp(c){
  if(!c || c.format !== 'stt-composition' || !Array.isArray(c.parts) || !Array.isArray(c.links)) throw new Error('format');
  const o = JSON.parse(JSON.stringify(c));
  o._cos = {}; Object.keys(o.companies || {}).forEach(k => { if(!ST.fleet.companies[k]) o._cos[k] = finalizeCompany(k, o.companies[k]); });
  if(!ST.fleet.companies[o.company] && !o._cos[o.company]) o.company = 'STT';
  return o;
}
function add(raw, opt){
  opt = opt || {};
  let c; try { c = normalizeComp(raw); } catch(e){ console.warn('[modulaire] composition ignorée', raw && raw.name, e.message); return null; }
  const s = statsOf(c); if(!s.parts) return null;
  const gm = Object.assign(autoGame(c, s), c.game || {}), id = 'mod_' + slug(c.id || c.name);
  if(c.type === 'station'){
    const i = ST.stations.findIndex(x => x.id === id); const e = { id, comp: c, stats: s, game: gm, imported: !!opt.imported };
    if(i >= 0) ST.stations[i] = e; else ST.stations.push(e);
    return e;
  }
  const fam = FAMILY[gm.family] || FAMILY.independant, co = companyOf(c, c.company);
  const M = { id, modular: true, comp: c, imported: !!opt.imported, group: fam.group, family: gm.family, name: String(c.name || 'Vaisseau modulaire').slice(0, 40),
    reg: String(c.registry || co.registry || 'STT-0000').toUpperCase(), livery: parseInt((co.livery_hex || '#888888').slice(1), 16), arch: gm.arch || fam.arch,
    tier: ['I', 'II', 'III', 'IV'].includes(gm.tier) ? gm.tier : 'II', ftl: !!gm.ftl, crew: +gm.crew || 0,
    massT: s.mass, tankM3: s.tank_m3, paxN: s.passengers, contN: s.containers,
    cap: s.containers ? [1, Math.max(1, Math.min(5, Math.ceil(s.containers/4)))] : null,
    meta: s.parts + ' modules' + (s.containers ? ', ' + s.containers + ' conteneurs' : '') + (s.passengers ? ', ' + s.passengers + ' passagers' : ''),
    desc: gm.description || ('Composition du chantier naval : ' + s.parts + ' modules STT-6.'),
    build: buildShip };
  const i = SHIPGEN.MODELS.findIndex(m => m.id === id);
  if(i >= 0) SHIPGEN.MODELS[i] = M; else SHIPGEN.MODELS.push(M);
  if(!ST.ships.includes(id)) ST.ships.push(id);
  return M;
}

/* ---------- import dans le hangar (gardé dans ce navigateur) ---------- */
function stored(){ try { const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
function importText(text){
  let o; try { o = JSON.parse(text); } catch(e){ return { ok: false, err: 'json' }; }
  const list = (Array.isArray(o) ? o : o && o.compositions ? o.compositions : [o]).filter(x => x && x.format === 'stt-composition');
  if(!list.length) return { ok: false, err: 'format' };
  const added = []; list.forEach(c => { const r = add(c, { imported: true }); if(r) added.push(r); });
  if(!added.length) return { ok: false, err: 'parts' };
  const keepList = stored().filter(c => !list.some(n => slug(n.id || n.name) === slug(c.id || c.name))).concat(list);
  try { localStorage.setItem(LS_KEY, JSON.stringify(keepList)); } catch(e){}
  if(onChange) onChange();
  return { ok: true, added };
}

/* ---------- stations : 4ᵉ archétype de port orbital (20n) ---------- */
function hash(s){ let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function stationPort(rnd, seedStr, id){
  const e = (id && ST.stations.find(x => x.id === id)) || ST.stations[hash(seedStr || String(rnd()))%ST.stations.length], comp = e.comp, A = assemble(comp);
  const G = new THREE.Group(); G.add(A.g); G.updateMatrixWorld(true);
  const cls = {}; (e.game.berths || []).forEach(b => { if(b && b.port) cls[b.port] = b.cls; });
  const dps = (comp.docking_ports || []).map(d => typeof d === 'string' ? d : d && d.port).filter(Boolean);
  const berths = [];
  dps.forEach(port => {
    const a = port.split('.'), Mw = A.W.get(a[0]), p = A.defs.get(a[0]); if(!Mw || !p) return;
    let S; try { S = new M4().multiplyMatrices(Mw, socketLocal(p.key, a[1])); } catch(err){ return; }
    const pos = new V3().setFromMatrixPosition(S), dir = new V3().setFromMatrixColumn(S, 1).normalize();
    const side = Math.abs(dir.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0).cross(dir).normalize();
    const c = ['S', 'M', 'L'].includes(cls[port]) ? cls[port] : 'M';
    berths.push({ cls: c, max: PORTS.CLASS_MAX[c], pos: pos.addScaledVector(dir, 1.2), dir, side, mode: 'ring', port });
  });
  /* règle des ports (spec B, 28/09) : au moins un poste L — l'anneau le plus dégagé (le plus loin du centre) le devient */
  const box = new THREE.Box3().setFromObject(G), ctr = box.getCenter(new V3());
  if(berths.length && !berths.some(b => b.cls === 'L')){
    const far = berths.reduce((a, b) => (b.pos.distanceTo(ctr) > a.pos.distanceTo(ctr) ? b : a));
    far.cls = 'L'; far.max = PORTS.CLASS_MAX.L;
  }
  if(!berths.length){ const top = new V3(ctr.x, box.max.y + 2, ctr.z); berths.push({ cls: 'L', max: PORTS.CLASS_MAX.L, pos: top, dir: new V3(0, 1, 0), side: new V3(1, 0, 0), mode: 'ring', port: null }); }
  bake(A.g, true);
  A.g.position.sub(ctr); G.updateMatrixWorld(true); berths.forEach(b => b.pos.sub(ctr));
  return { group: G, spin: null, berths, top: box.max.y - ctr.y, name: comp.name, comp: e.id };
}

/* ---------- engins de baie : la navette amarrée dans la baie s'efface pendant la sortie d'un engin ---------- */
function update(){
  if(!ST.ready || typeof SHIP_BUILD === 'undefined' || !SHIP_BUILD || !SHIP_BUILD.docks) return;
  const L = typeof orbitState !== 'undefined' && orbitState.loading, busy = !!(L && L.bayFlow);
  SHIP_BUILD.docks.forEach(d => { if(d.hide) d.hide.forEach(o => { o.visible = !busy; }); });
}

/* le générateur reçoit les modèles modulaires sans ses greffons procéduraux (cloches, vitrages, textures HD),
   et les points d'accroche fournis par l'assembleur (baies) */
const build0 = SHIPGEN.build;
SHIPGEN.build = function(id, opts){
  const M = SHIPGEN.MODELS.find(m => m.id === id);
  if(!M || !M.modular) return build0.call(SHIPGEN, id, opts);
  const b = build0.call(SHIPGEN, id, Object.assign({}, opts, { realDrive: false, realGlass: false, hiTex: false }));
  const X = b.group.userData.extern || {};
  b.docks = X.docks || []; b.massT = M.massT; b.tankM3 = M.tankM3; b.modular = true;
  return b;
};

init();
return {
  get ready(){ return ST.ready; }, get settled(){ return ST.settled; }, get failed(){ return ST.failed; },
  whenReady, keeps: (x) => !!x && KEEP.has(x), importText, update, stationPort, statsOf, portsOf,
  hasStations: () => ST.ready && ST.stations.length > 0,
  stations: () => ST.stations.slice(), ships: () => ST.ships.slice(),
  set onChange(f){ onChange = f; }, _st: ST
};
})();
