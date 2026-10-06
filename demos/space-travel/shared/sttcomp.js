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

  /* ===== IMPORT / EXPORT (L2a.5) ===== */

  return core;
}

return { m4, v3, PORT_PREF, create };
})();
if (typeof module !== 'undefined') module.exports = STTCOMP;
