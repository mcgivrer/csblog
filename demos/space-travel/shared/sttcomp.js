/* @provides STTCOMP */
/* =====================================================================
   STTCOMP — noyau d'assemblage des compositions (vaisseaux / stations)
   Portage fidèle des règles de l'éditeur STT_modules/sources/index.html (sans moteur 3D, sans DOM).
   - Matrices : Float64Array(16) colonne-major (ordre glTF).
   - STTCOMP.create(env) : noyau lié à env = { geom, fleet:{modules,container_brands,zones,companies},
     knownCompany(k), rand(), uid() } ; aucune globale, aucun état caché : la composition c est passée en 1er argument.
   - Le noyau rend des CODES ; les textes restent chez l'appelant.
   ===================================================================== */
var STTCOMP = (function () {
'use strict';

/* ---------- vecteurs ---------- */
const v3 = {
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/* ---------- matrices 4x4 colonne-major : m[col*4 + row] ---------- */
const m4 = {
  identity() { const o = new Float64Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  mul(a, b, out) {
    const o = out || new Float64Array(16), r = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) {
      r[c * 4 + rw] = a[rw] * b[c * 4] + a[4 + rw] * b[c * 4 + 1] + a[8 + rw] * b[c * 4 + 2] + a[12 + rw] * b[c * 4 + 3];
    }
    for (let i = 0; i < 16; i++) o[i] = r[i];
    return o;
  },
  /* inverse d'une matrice affine générale (bloc 3x3 + translation) */
  invert(a, out) {
    const o = out || new Float64Array(16);
    const a0 = a[0], a1 = a[1], a2 = a[2], b0 = a[4], b1 = a[5], b2 = a[6], c0 = a[8], c1 = a[9], c2 = a[10];
    const tx = a[12], ty = a[13], tz = a[14];
    const det = a0 * (b1 * c2 - b2 * c1) - b0 * (a1 * c2 - a2 * c1) + c0 * (a1 * b2 - a2 * b1);
    const d = det ? 1 / det : 0;
    const i0 = (b1 * c2 - b2 * c1) * d, i1 = (a2 * c1 - a1 * c2) * d, i2 = (a1 * b2 - a2 * b1) * d;
    const i4 = (b2 * c0 - b0 * c2) * d, i5 = (a0 * c2 - a2 * c0) * d, i6 = (a2 * b0 - a0 * b2) * d;
    const i8 = (b0 * c1 - b1 * c0) * d, i9 = (a1 * c0 - a0 * c1) * d, i10 = (a0 * b1 - a1 * b0) * d;
    o[0] = i0; o[1] = i1; o[2] = i2; o[3] = 0;
    o[4] = i4; o[5] = i5; o[6] = i6; o[7] = 0;
    o[8] = i8; o[9] = i9; o[10] = i10; o[11] = 0;
    o[12] = -(i0 * tx + i4 * ty + i8 * tz); o[13] = -(i1 * tx + i5 * ty + i9 * tz); o[14] = -(i2 * tx + i6 * ty + i10 * tz); o[15] = 1;
    return o;
  },
  rotX(r) { const o = m4.identity(), c = Math.cos(r), s = Math.sin(r); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  rotY(r) { const o = m4.identity(), c = Math.cos(r), s = Math.sin(r); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  translation(x, y, z) { const o = m4.identity(); o[12] = x; o[13] = y; o[14] = z; return o; },
  basis(X, Y, Z, p) {
    const o = m4.identity(); p = p || [0, 0, 0];
    o[0] = X[0]; o[1] = X[1]; o[2] = X[2]; o[4] = Y[0]; o[5] = Y[1]; o[6] = Y[2];
    o[8] = Z[0]; o[9] = Z[1]; o[10] = Z[2]; o[12] = p[0]; o[13] = p[1]; o[14] = p[2];
    return o;
  },
  /* t=[x,y,z], q=[x,y,z,w], s=[x,y,z] (composition TRS standard) */
  fromTRS(t, q, s) {
    t = t || [0, 0, 0]; q = q || [0, 0, 0, 1]; s = s || [1, 1, 1];
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const o = new Float64Array(16);
    o[0] = (1 - (yy + zz)) * s[0]; o[1] = (xy + wz) * s[0]; o[2] = (xz - wy) * s[0];
    o[4] = (xy - wz) * s[1]; o[5] = (1 - (xx + zz)) * s[1]; o[6] = (yz + wx) * s[1];
    o[8] = (xz + wy) * s[2]; o[9] = (yz - wx) * s[2]; o[10] = (1 - (xx + yy)) * s[2];
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  },
  point(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; },
  dir(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; },
  col(m, i) { return [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]]; },
  pos(m) { return [m[12], m[13], m[14]]; },
};
/* repère Blender -> glTF (Z haut -> Y haut) */
m4.C = Float64Array.from([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
m4.Ci = m4.invert(m4.C);
m4.RX = m4.rotX(Math.PI);
const { C, Ci, RX } = m4;
const M = (m) => (m instanceof Float64Array ? m : Float64Array.from(m));

const PORT_PREF = ['AFT', 'PORT', 'STBD', 'TOP', 'BOT', 'FWD', 'DORSAL', 'SHUTTLE', 'PAD'];

/* ---------- fiche de jeu : tables et règles pures (libellés fr par défaut ; l'appelant traduit via les codes) ---------- */
const FAMILIES = { fret: 'Fret', passagers: 'Passagers', vrac: 'Vrac', independant: 'Indépendant', pousseur: 'Pousseur' };
const ARCH_AUTO = { fret: 'Cargo modulaire', passagers: 'Paquebot modulaire', vrac: 'Citernier modulaire', independant: 'Indépendant modulaire', pousseur: 'Pousseur modulaire' };
const CREW = { I: 2, II: 4, III: 6, IV: 10 };
function autoGame(st) {
  const tier = st.mass < 800 ? 'I' : st.mass < 1300 ? 'II' : st.mass < 2000 ? 'III' : 'IV';
  const family = st.containers >= 4 ? 'fret' : st.passengers >= 48 ? 'passagers' : st.tank_m3 >= 1680 ? 'vrac' : st.parts <= 4 ? 'pousseur' : 'independant';
  return { tier, family, ftl: tier === 'III' || tier === 'IV', crew: CREW[tier] };
}
function cleanGame(g, c) {
  const o = {};
  if (!g || typeof g !== 'object') return o;
  if (FAMILIES[g.family]) o.family = g.family;
  if (['I', 'II', 'III', 'IV'].includes(g.tier)) o.tier = g.tier;
  if (typeof g.ftl === 'boolean') o.ftl = g.ftl;
  if (+g.crew >= 1) o.crew = Math.min(60, Math.round(+g.crew));
  if (g.arch && String(g.arch).trim()) o.arch = String(g.arch).trim().slice(0, 40);
  if (g.description && String(g.description).trim()) o.description = String(g.description).trim().slice(0, 400);
  const ports = new Set((c && c.docking_ports) || []);
  const b = Array.isArray(g.berths) ? g.berths.filter((x) => x && ports.has(x.port) && ['S', 'M', 'L'].includes(x.cls)).map((x) => ({ port: x.port, cls: x.cls })) : [];
  if (b.length) o.berths = b;
  return o;
}

/* ---------- noyau lié à un environnement ---------- */
function create(env) {
  env = env || {};
  const geom = env.geom || { modules: {} };
  const fleet = env.fleet || { modules: {}, container_brands: {}, zones: {}, companies: {} };
  let seed = 123456789, n = 0;
  const rand = env.rand || (() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  const uid = env.uid || (() => 'c' + (++n).toString(36));
  const gm = (key) => geom.modules && geom.modules[key];

  /* --- géométrie --- */
  const portsCache = new Map(), sockCache = new Map(), contCache = new Map();
  function portsOf(key) {
    if (portsCache.has(key)) return portsCache.get(key);
    const out = ((gm(key) && gm(key).ports) || []).slice();
    out.sort((a, b) => PORT_PREF.indexOf(a) - PORT_PREF.indexOf(b));
    portsCache.set(key, out); return out;
  }
  const portKind = (key, port) => ((key === 'BAY' && port === 'SHUTTLE') || (key === 'SHUTTLE' && port === 'PAD')) ? 'pad' : 'ring';
  function socketLocal(key, port) {
    const k = key + '.' + port;
    if (sockCache.has(k)) return sockCache.get(k);
    const a = gm(key) && gm(key).sockets && gm(key).sockets[port];
    if (!a) throw new Error('Socket ' + key + '.' + port + ' introuvable');
    const m = M(a); sockCache.set(k, m); return m;
  }
  function mate(Ps, key, port, rollDeg) {
    const r = m4.mul(m4.mul(M(Ps), RX), m4.rotY((rollDeg || 0) * Math.PI / 180));
    return m4.mul(r, m4.invert(socketLocal(key, port)));
  }
  function containerMatrix(key, sockG) {
    const Sb = m4.mul(m4.mul(Ci, sockG), C);
    const p = m4.pos(Sb), r = v3.norm(m4.col(Sb, 2)), ax = [0, 1, 0];
    const Y = key === 'CARGO' ? ax : r, Z = key === 'CARGO' ? r : ax;
    const X = v3.norm(v3.cross(Y, Z));
    const Mb = m4.basis(X, Y, Z, p);
    return { M: m4.mul(m4.mul(C, Mb), Ci), dir: m4.dir(C, r) };
  }
  function containerMats(key) {
    if (contCache.has(key)) return contCache.get(key);
    const list = ((gm(key) && gm(key).containers) || []).map((c) => Object.assign({ slot: c.slot }, containerMatrix(key, M(c.m))));
    contCache.set(key, list); return list;
  }
  const massOf = (key) => { const g = gm(key); return g && g.mass_t != null ? g.mass_t : 50; };
  const lenOf = (key) => {
    const f = fleet.modules && fleet.modules[key], g = gm(key);
    return (f && f.length != null) ? f.length : (g && g.length_m != null ? g.length_m : 10);
  };
  const brandKeys = () => Object.keys(fleet.container_brands || {});
  const randomBrand = () => { const k = brandKeys(); return k[Math.floor(rand() * k.length)]; };

  /* --- composition --- */
  const blank = (type) => ({ id: uid(), name: 'Nouvelle composition', type: type || 'ship', company: 'STT', registry: '', parts: [], extra_links: [], docking_ports: [], game: {} });

  /* --- graphe --- */
  const part = (c, id) => c.parts.find((p) => p.id === id);
  const kids = (c, id) => c.parts.filter((p) => p.parent === id);
  function subtree(c, id) { const out = [id]; for (let i = 0; i < out.length; i++) for (const k of kids(c, out[i])) out.push(k.id); return out; }
  function ordered(c) {
    const out = [], seen = new Set();
    const visit = (p) => { if (seen.has(p.id)) return; seen.add(p.id); out.push(p); kids(c, p.id).forEach(visit); };
    c.parts.filter((p) => !p.parent || !part(c, p.parent)).forEach(visit);
    return out;
  }
  function nextId(c, key) {
    const pre = key.toLowerCase(), ids = new Set(c.parts.map((p) => p.id)); let i = 1;
    while (ids.has(pre + i)) i++; return pre + i;
  }
  function usedPorts(c, excl) {
    const u = new Set();
    for (const p of c.parts) {
      if ((excl && excl.has(p.id)) || !p.parent) continue;
      u.add(p.id + '.' + p.port); u.add(p.parent + '.' + p.pport);
    }
    for (const [a, b] of c.extra_links) {
      if (excl && (excl.has(a.split('.')[0]) || excl.has(b.split('.')[0]))) continue;
      u.add(a); u.add(b);
    }
    return u;
  }
  function freePorts(c, excl) {
    const u = usedPorts(c, excl), out = [];
    for (const p of c.parts) {
      if (excl && excl.has(p.id)) continue;
      for (const port of portsOf(p.key)) if (!u.has(p.id + '.' + port)) out.push({ id: p.id, key: p.key, port, kind: portKind(p.key, port) });
    }
    return out;
  }
  function compatible(c, key, f) {
    if (c.type === 'station' && key === 'PROP') return false;
    return portsOf(key).some((p) => portKind(key, p) === f.kind);
  }
  const childPorts = (key, kind) => portsOf(key).filter((p) => portKind(key, p) === kind);
  function defaultChildPort(key, parentKey, pport) {
    const kind = portKind(parentKey, pport), ports = childPorts(key, kind);
    if (!ports.length) return null;
    if (kind === 'pad') return ports[0];
    if (key === 'SHUTTLE') return ports.includes('DORSAL') ? 'DORSAL' : ports[0];
    if (pport === 'FWD' && ports.includes('AFT')) return 'AFT';
    return ports.includes('FWD') ? 'FWD' : ports[0];
  }
  function world(c) {
    const W = new Map();
    const visit = (p, Mp) => {
      W.set(p.id, Mp);
      for (const k of kids(c, p.id)) {
        try { visit(k, mate(m4.mul(Mp, socketLocal(p.key, k.pport)), k.key, k.port, k.roll || 0)); } catch (e) { /* socket absent : pièce ignorée */ }
      }
    };
    c.parts.filter((p) => !p.parent || !part(c, p.parent)).forEach((r, i) => visit(r, m4.translation(i * 60, 0, 0)));
    return W;
  }
  function normalize(c) {
    for (let k = -1; k !== c.parts.length;) {
      k = c.parts.length; const ids = new Set(c.parts.map((p) => p.id));
      c.parts = c.parts.filter((p) => !p.parent || ids.has(p.parent));
    }
    const alive = new Set(c.parts.map((p) => p.id));
    c.extra_links = c.extra_links.filter(([a, b]) => alive.has(a.split('.')[0]) && alive.has(b.split('.')[0]));
    const u = usedPorts(c);
    c.docking_ports = [...new Set(c.docking_ports)].filter((s) => alive.has(s.split('.')[0]) && !u.has(s));
    return c;
  }

  /* --- mutations (aucun effet de bord UI) --- */
  function addPart(c, key, cand, port, roll) {
    if (!cand && c.parts.length) return { ok: false, code: 'need_port' };
    if (c.type === 'station' && key === 'PROP') return { ok: false, code: 'station_prop' };
    const p = { id: nextId(c, key), key, parent: cand ? cand.id : null, pport: cand ? cand.port : null, port: cand ? port : null, roll: cand ? (roll || 0) : 0, zone: null, door: 'mech', company: null, containers: null };
    if (cand && c.type === 'station') { const pp = part(c, cand.id); p.zone = (pp && pp.zone) || null; }
    if (key === 'CARGO' || key === 'CRG6') p.containers = containerMats(key).map(() => randomBrand());
    c.parts.push(p);
    return { ok: true, part: p };
  }
  function movePart(c, pid, cand, port, roll) {
    const p = part(c, pid); if (!p) return { ok: false, code: 'no_part' };
    const sub = new Set(subtree(c, pid));
    c.extra_links = c.extra_links.filter(([a, b]) => !sub.has(a.split('.')[0]) && !sub.has(b.split('.')[0]));
    Object.assign(p, { parent: cand.id, pport: cand.port, port, roll });
    return { ok: true };
  }
  function deletePart(c, pid) {
    const sub = new Set(subtree(c, pid));
    c.parts = c.parts.filter((p) => !sub.has(p.id));
    return { ok: true, removed: sub.size };
  }
  function replacePart(c, pid, key) {
    const p = part(c, pid); if (!p || p.key === key) return { ok: false, code: 'noop' };
    if (p.parent) {
      const pk = part(c, p.parent).key, kind = portKind(pk, p.pport), ports = childPorts(key, kind);
      if (!ports.length) return { ok: false, code: 'port_incompatible' };
      p.port = ports.includes(p.port) ? p.port : defaultChildPort(key, pk, p.pport);
    }
    const ok = new Set(portsOf(key)); let removed = 0;
    for (const k of kids(c, pid)) {
      if (!ok.has(k.pport) || portKind(key, k.pport) !== portKind(p.key, k.pport)) {
        const s = new Set(subtree(c, k.id)); removed += s.size; c.parts = c.parts.filter((x) => !s.has(x.id));
      }
    }
    p.key = key;
    p.containers = key === 'CARGO' || key === 'CRG6' ? containerMats(key).map(() => randomBrand()) : null;
    return { ok: true, removed };
  }

  const core = {
    env, portsOf, portKind, socketLocal, mate, containerMats, massOf, lenOf, blank,
    part, kids, subtree, ordered, nextId, usedPorts, freePorts, compatible, childPorts, defaultChildPort, world, normalize,
    addPart, movePart, deletePart, replacePart,
  };

  /* ===== CONTRÔLES (L2a.4) ===== */
  /* boîtes = [minx,miny,minz,maxx,maxy,maxz] relatives à STT_<KEY>_ROOT (geom.modules[k].hull / .full, geom.container.hull) */
  const ZB = [0, 0, 0, 0, 0, 0];
  const hullBox = (key) => key === '__CONTAINER__' ? ((geom.container && geom.container.hull) || ZB) : ((gm(key) && gm(key).hull) || ZB);
  const fullBox = (key) => (gm(key) && (gm(key).full || gm(key).hull)) || ZB;   // statique + pièces animées (pose du fichier)
  function obb(Mx, box, shrink) {
    shrink = shrink || 0;
    const u = [m4.col(Mx, 0), m4.col(Mx, 1), m4.col(Mx, 2)], sc = u.map(v3.len), un = u.map(v3.norm);
    const s = [box[3] - box[0], box[4] - box[1], box[5] - box[2]];
    const c = m4.point(Mx, [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2]);
    return { c, u: un, e: [0, 1, 2].map((i) => Math.max(0.05, s[i] / 2 * sc[i] - shrink)) };
  }
  function obbCorners(o, out) {
    for (let i = 0; i < 8; i++) {
      out.push(v3.add(v3.add(v3.add(o.c, v3.scale(o.u[0], (i & 1 ? 1 : -1) * o.e[0])), v3.scale(o.u[1], (i & 2 ? 1 : -1) * o.e[1])), v3.scale(o.u[2], (i & 4 ? 1 : -1) * o.e[2])));
    }
    return out;
  }
  function obbOverlap(A, B) {   // séparation d'axes (Ericson, RTCD 4.4)
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = v3.dot(A.u[i], B.u[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-6; }
    const tv = v3.sub(B.c, A.c), t = [v3.dot(tv, A.u[0]), v3.dot(tv, A.u[1]), v3.dot(tv, A.u[2])];
    const a = A.e, b = B.e; let ra, rb;
    for (let i = 0; i < 3; i++) { ra = a[i]; rb = b[0] * AR[i][0] + b[1] * AR[i][1] + b[2] * AR[i][2]; if (Math.abs(t[i]) > ra + rb) return false; }
    for (let j = 0; j < 3; j++) { ra = a[0] * AR[0][j] + a[1] * AR[1][j] + a[2] * AR[2][j]; rb = b[j]; if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > ra + rb) return false; }
    ra = a[1] * AR[2][0] + a[2] * AR[1][0]; rb = b[1] * AR[0][2] + b[2] * AR[0][1]; if (Math.abs(t[2] * R[1][0] - t[1] * R[2][0]) > ra + rb) return false;
    ra = a[1] * AR[2][1] + a[2] * AR[1][1]; rb = b[0] * AR[0][2] + b[2] * AR[0][0]; if (Math.abs(t[2] * R[1][1] - t[1] * R[2][1]) > ra + rb) return false;
    ra = a[1] * AR[2][2] + a[2] * AR[1][2]; rb = b[0] * AR[0][1] + b[1] * AR[0][0]; if (Math.abs(t[2] * R[1][2] - t[1] * R[2][2]) > ra + rb) return false;
    ra = a[0] * AR[2][0] + a[2] * AR[0][0]; rb = b[1] * AR[1][2] + b[2] * AR[1][1]; if (Math.abs(t[0] * R[2][0] - t[2] * R[0][0]) > ra + rb) return false;
    ra = a[0] * AR[2][1] + a[2] * AR[0][1]; rb = b[0] * AR[1][2] + b[2] * AR[1][0]; if (Math.abs(t[0] * R[2][1] - t[2] * R[0][1]) > ra + rb) return false;
    ra = a[0] * AR[2][2] + a[2] * AR[0][2]; rb = b[0] * AR[1][1] + b[1] * AR[1][0]; if (Math.abs(t[0] * R[2][2] - t[2] * R[0][2]) > ra + rb) return false;
    ra = a[0] * AR[1][0] + a[1] * AR[0][0]; rb = b[1] * AR[2][2] + b[2] * AR[2][1]; if (Math.abs(t[1] * R[0][0] - t[0] * R[1][0]) > ra + rb) return false;
    ra = a[0] * AR[1][1] + a[1] * AR[0][1]; rb = b[0] * AR[2][2] + b[2] * AR[2][0]; if (Math.abs(t[1] * R[0][1] - t[0] * R[1][1]) > ra + rb) return false;
    ra = a[0] * AR[1][2] + a[1] * AR[0][2]; rb = b[0] * AR[2][1] + b[2] * AR[2][0]; if (Math.abs(t[1] * R[0][2] - t[0] * R[1][2]) > ra + rb) return false;
    return true;
  }
  function rayOBB(o, d, b) {
    let tmin = -Infinity, tmax = Infinity; const p = v3.sub(b.c, o);
    for (let i = 0; i < 3; i++) {
      const e = v3.dot(b.u[i], p), f = v3.dot(b.u[i], d);
      if (Math.abs(f) > 1e-9) {
        let t1 = (e + b.e[i]) / f, t2 = (e - b.e[i]) / f; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax || tmax < 0) return null;
      } else if (-e - b.e[i] > 0 || -e + b.e[i] < 0) return null;
    }
    return tmin > 0 ? tmin : tmax;
  }
  const anyOverlap = (la, lb) => la.some((a) => lb.some((b) => obbOverlap(a, b)));
  function partOBBs(c, p, Mx) {
    const list = [obb(Mx, hullBox(p.key), 0.35)];
    if (p.containers) containerMats(p.key).forEach((cm, i) => { if (p.containers[i]) list.push(obb(m4.mul(Mx, cm.M), hullBox('__CONTAINER__'), 0.2)); });
    return list;
  }
  function analyze(c, W) {
    W = W || world(c);
    const issues = [], obbs = new Map(), colliding = new Set(), pairs = [], corners = [];
    let mass = 0, nCont = 0, pax = 0, tank = 0, com = [0, 0, 0];
    for (const [id, Mx] of W) {
      const p = part(c, id), list = partOBBs(c, p, Mx);
      obbs.set(id, list);
      const m = massOf(p.key); mass += m; com = v3.add(com, v3.scale(list[0].c, m));
      for (let i = 1; i < list.length; i++) { nCont++; mass += 6.5; com = v3.add(com, v3.scale(list[i].c, 6.5)); }
      if (p.key === 'PAX') pax += 48; if (p.key === 'SHUTTLE') pax += 8; if (p.key === 'TANK') tank += 840;
      obbCorners(obb(Mx, fullBox(p.key)), corners);
      for (let i = 1; i < list.length; i++) obbCorners(list[i], corners);
    }
    if (mass) com = v3.scale(com, 1 / mass);
    let aabb = [0, 0, 0, 0, 0, 0];
    if (corners.length) {
      aabb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const q of corners) for (let i = 0; i < 3; i++) { aabb[i] = Math.min(aabb[i], q[i]); aabb[i + 3] = Math.max(aabb[i + 3], q[i]); }
    }
    const ids = [...W.keys()];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = part(c, ids[i]), b = part(c, ids[j]);
      if (a.parent === b.id || b.parent === a.id) continue;
      if (anyOverlap(obbs.get(a.id), obbs.get(b.id))) { pairs.push([a.id, b.id]); colliding.add(a.id); colliding.add(b.id); }
    }
    const of = (k) => c.parts.filter((p) => p.key === k);
    let axis = [0, 0, 1];
    const props = of('PROP');
    if (props.length && W.has(props[0].id)) axis = v3.norm(m4.col(W.get(props[0].id), 2));
    else if (c.parts.length) axis = v3.norm(m4.col(W.get(ordered(c)[0].id), 2));
    let lo = Infinity, hi = -Infinity; for (const q of corners) { const d = v3.dot(q, axis); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const length = corners.length ? hi - lo : 0;
    const stats = { parts: c.parts.length, mass: Math.round(mass), containers: nCont, passengers: pax, tank_m3: tank, length_m: +length.toFixed(1),
      size_m: corners.length ? [0, 1, 2].map((i) => +(aabb[i + 3] - aabb[i]).toFixed(1)) : [0, 0, 0] };
    const res = { issues, obbs, colliding, pairs, aabb, stats, com };

    if (!c.parts.length) { issues.push({ sev: 'info', code: 'empty', args: {}, ids: [] }); return res; }
    if (c.type === 'station') {
      for (const p of props) issues.push({ sev: 'err', code: 'station_prop', args: { id: p.id }, ids: [p.id] });
    } else {
      if (!props.length) issues.push({ sev: 'warn', code: 'no_prop', args: {}, ids: [] });
      if (props.length > 1) issues.push({ sev: 'warn', code: 'multi_prop', args: { n: props.length }, ids: props.map((p) => p.id) });
      if (!of('CMD').length) issues.push({ sev: 'warn', code: 'no_cmd', args: {}, ids: [] });
      const pg = gm('PROP'), exRel = pg && pg.exhaust ? M(pg.exhaust) : m4.translation(0, 0, -lenOf('PROP'));
      for (const p of props) {
        const Wp = W.get(p.id); if (!Wp) continue;
        const fwd = v3.norm(m4.col(Wp, 2)), o = m4.pos(m4.mul(Wp, exRel)), back = v3.scale(fwd, -1);
        let hit = null;
        for (const [id, list] of obbs) { if (id === p.id) continue; for (const b of list) { const t = rayOBB(o, back, b); if (t !== null && t > 0.2 && t < 400) { hit = id; break; } } if (hit) break; }
        if (hit) issues.push({ sev: 'err', code: 'jet_hit', args: { id: p.id, hit }, ids: [p.id, hit] });
        const off = v3.len(v3.cross(v3.sub(com, m4.pos(Wp)), fwd));
        if (off > 2.5) issues.push({ sev: 'warn', code: 'thrust_offset', args: { id: p.id, off: +off.toFixed(1) }, ids: [p.id] });
      }
    }
    if (!of('PWR').length) issues.push({ sev: 'warn', code: 'no_pwr', args: {}, ids: [] });
    pairs.slice(0, 8).forEach(([a, b]) => issues.push({ sev: 'warn', code: 'overlap', args: { a, b }, ids: [a, b] }));
    if (pairs.length > 8) issues.push({ sev: 'warn', code: 'overlap_more', args: { n: pairs.length - 8 }, ids: [] });
    if (c.type === 'station' && !c.docking_ports.length) issues.push({ sev: 'info', code: 'no_dock', args: {}, ids: [] });
    if (!issues.some((i) => i.sev === 'err' || i.sev === 'warn')) issues.unshift({ sev: 'ok', code: c.type === 'ship' ? 'valid_ship' : 'valid_station', args: {}, ids: [] });
    return res;
  }

  /* --- fiche de jeu --- */
  function resolvedGame(c, stats) {
    const a = autoGame(stats), g = cleanGame(c.game, c);
    if (c.type === 'station') {
      const cls = Object.fromEntries((g.berths || []).map((b) => [b.port, b.cls]));
      return { version: 1, class: 'station', description: g.description || '', berths: c.docking_ports.map((port) => ({ port, cls: cls[port] || 'M' })) };
    }
    const family = g.family || a.family, tier = g.tier || a.tier;
    return { version: 1, class: 'ship', family, tier, ftl: g.ftl ?? (tier === 'III' || tier === 'IV'), crew: g.crew || CREW[tier], arch: g.arch || ARCH_AUTO[family], description: g.description || '' };
  }
  /* utilise core.toExport (L2a.5) ; erreurs en codes : empty | has_errors (+ issue) | no_prop | no_export */
  function gameExport(c, analysis) {
    const errs = analysis.issues.filter((i) => i.sev === 'err');
    if (!c.parts.length) return { error: 'empty' };
    if (errs.length) return { error: 'has_errors', issue: errs[0] };
    if (c.type === 'ship' && !c.parts.some((p) => p.key === 'PROP')) return { error: 'no_prop' };
    if (!core.toExport) return { error: 'no_export' };
    const o = core.toExport(c);
    o.game = resolvedGame(c, analysis.stats);
    o.stats = analysis.stats;
    return { data: o, warn: analysis.issues.filter((i) => i.sev === 'warn').length };
  }
  Object.assign(core, { hullBox, fullBox, obb, obbCorners, obbOverlap, rayOBB, anyOverlap, partOBBs, analyze, autoGame, cleanGame, resolvedGame, gameExport, FAMILIES, ARCH_AUTO, CREW });

  /* ===== IMPORT / EXPORT (L2a.5) ===== */
  /* stt-composition v1. env facultatifs : knownCompany(k), companyOf(k)->{registry}, mergeCompanies(obj) (appelé à l'import) */
  const known = (k) => (env.knownCompany ? !!env.knownCompany(k) : !!fleet.companies[k]);
  const companyOf = (k) => (env.companyOf && env.companyOf(k)) || fleet.companies[k] || fleet.companies.STT || {};
  const coDef = (d) => ({ name: d.name, mark: d.mark, tagline: d.tagline, registry: d.registry, livery_hex: d.livery_hex, emblem: d.emblem });
  /* opts : { companies:{clé:def} marques perso utilisées, stats } */
  function toExport(c, opts) {
    opts = opts || {};
    const custom = opts.companies || {};
    const used = new Set([c.company, ...c.parts.map((p) => p.company).filter(Boolean)]);
    const companies = {};
    for (const k of used) if (custom[k]) companies[k] = coDef(custom[k]);
    const parts = [], links = [], containers = {};
    for (const p of ordered(c)) {
      const o = {};
      if (p.zone) o.zone = p.zone;
      if (p.key === 'BAY') o.door = p.door || 'mech';
      if (p.company) o.company = p.company;
      parts.push(Object.keys(o).length ? [p.id, p.key, o] : [p.id, p.key]);
      if (p.parent) links.push([`${p.parent}.${p.pport}`, `${p.id}.${p.port}`, p.roll || 0]);
      if (p.containers && p.containers.some(Boolean)) containers[p.id] = p.containers.map((b) => b || null);
    }
    for (const l of c.extra_links) links.push(l);
    const reg = c.registry || (custom[c.company] || companyOf(c.company)).registry;
    const out = { format: 'stt-composition', version: 1, generator: 'Chantier naval STT', id: c.id, name: c.name, type: c.type, company: c.company, registry: reg };
    if (Object.keys(companies).length) out.companies = companies;
    Object.assign(out, { root: parts[0] ? parts[0][0] : null, parts, links, containers, docking_ports: c.docking_ports.map((port) => ({ port })) });
    const gs = cleanGame(c.game, c);
    if (Object.keys(gs).length) out.game = gs;
    if (opts.stats) out.stats = opts.stats;
    return out;
  }
  function fromGraph(o) {
    const c = blank(o.type === 'station' ? 'station' : 'ship');
    if (o.format === 'stt-composition' && o.id) c.id = String(o.id);
    c.name = String(o.name || 'Composition importée').slice(0, 60);
    c.company = known(o.company) ? o.company : 'STT';
    const reg = String(o.registry || '').toUpperCase();
    c.registry = reg && reg !== companyOf(c.company).registry ? reg.slice(0, 14) : '';
    const defs = new Map();
    for (const p of o.parts || []) {
      const [id, key, opts] = Array.isArray(p) ? p : [p && p.id, p && p.key, p];
      if (id != null && gm(key) && !defs.has(String(id))) defs.set(String(id), { key, opts: opts || {} });
    }
    let links = (o.links || []).filter((l) => Array.isArray(l) && l.length >= 2);
    for (const [port, co] of o.shuttles || []) {
      let n = 1; while (defs.has('shuttle' + n)) n++;
      defs.set('shuttle' + n, { key: 'SHUTTLE', opts: { company: co } }); links = [...links, [port, `shuttle${n}.PAD`, 0]];
    }
    if (!defs.size) return c;
    const conts = o.containers || {};
    const mk = (id, parent, pport, port, roll) => {
      const d = defs.get(id), op = d.opts || {}, n = containerMats(d.key).length;
      let cs = null;
      if (n) cs = Array.from({ length: n }, (_, i) => { const b = Array.isArray(conts[id]) ? conts[id][i] : null; return (fleet.container_brands || {})[b] ? b : null; });
      return { id, key: d.key, parent, pport, port, roll: (((+roll || 0) % 360) + 360) % 360, zone: (fleet.zones || {})[op.zone] ? op.zone : null, door: op.door === 'field' ? 'field' : 'mech', company: op.company && known(op.company) ? op.company : null, containers: cs };
    };
    const rootId = o.root != null && defs.has(String(o.root)) ? String(o.root) : defs.keys().next().value;
    const placed = new Set([rootId]); c.parts.push(mk(rootId, null, null, null, 0));
    const valid = (id, port) => portsOf(defs.get(id).key).includes(port);
    const extra = [];
    let pending = links.slice(), progress = true;
    while (pending.length && progress) {
      progress = false; const next = [];
      for (const l of pending) {
        const [pa, pp] = String(l[0]).split('.'), [ca, cp] = String(l[1]).split('.'), r = +l[2] || 0;
        if (!defs.has(pa) || !defs.has(ca) || !valid(pa, pp) || !valid(ca, cp)) continue;
        if (placed.has(pa) && !placed.has(ca)) { c.parts.push(mk(ca, pa, pp, cp, r)); placed.add(ca); progress = true; }
        else if (placed.has(ca) && !placed.has(pa)) { c.parts.push(mk(pa, ca, cp, pp, -r)); placed.add(pa); progress = true; }
        else if (placed.has(pa) && placed.has(ca)) extra.push([`${pa}.${pp}`, `${ca}.${cp}`, r]);
        else next.push(l);
      }
      pending = next;
    }
    const used = new Set(); for (const p of c.parts) if (p.parent) { used.add(p.id + '.' + p.port); used.add(p.parent + '.' + p.pport); }
    for (const l of extra) if (!used.has(l[0]) && !used.has(l[1])) { c.extra_links.push(l); used.add(l[0]); used.add(l[1]); }
    c.docking_ports = (o.docking_ports || []).map((d) => (typeof d === 'string' ? d : d && d.port)).filter(Boolean);
    c.game = cleanGame(o.game, c);
    return c;
  }
  function fromShip(s) {
    const parts = [], links = [], containers = {}, counts = {};
    (s.modules || []).forEach((key, i) => {
      counts[key] = (counts[key] || 0) + 1;
      const id = key.toLowerCase() + counts[key];
      if (i) links.push([`${parts[i - 1][0]}.AFT`, `${id}.FWD`, (s.module_roll_deg || [])[i] || 0]);
      parts.push([id, key]);
      const cs = (s.containers || {})[`${key}#${counts[key]}`]; if (cs) containers[id] = cs;
    });
    return fromGraph({ name: s.name, type: 'ship', company: s.company, registry: s.registry, parts, links, containers });
  }
  const fromStation = (st) => fromGraph({ name: st.name, type: 'station', company: st.company, parts: st.parts, links: st.links, containers: st.containers, docking_ports: st.docking_ports, shuttles: st.shuttles });
  function importObject(o) {
    const out = [];
    const take = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(take); return; }
      if (x.format === 'stt-composition') { if (env.mergeCompanies) env.mergeCompanies(x.companies); out.push(fromGraph(x)); }
      else if (Array.isArray(x.parts) && Array.isArray(x.links)) out.push(fromStation(x));
      else if (Array.isArray(x.modules)) out.push(fromShip(x));
      else if (x.ships || x.stations || x.compositions) { (x.ships || []).forEach(take); (x.stations || []).forEach(take); (x.compositions || []).forEach(take); }
    };
    take(o);
    return out.filter((c) => c.parts.length);
  }
  Object.assign(core, { toExport, fromGraph, fromShip, fromStation, importObject, coDef });

  return core;
}

return { m4, v3, PORT_PREF, FAMILIES, ARCH_AUTO, CREW, autoGame, cleanGame, create };
})();
if (typeof module !== 'undefined') module.exports = STTCOMP;
