/* =====================================================================
   EXPORT DE CLIP (lot P4) — window.__CLIP.create(canvas) → C
   1. Image par image (WebCodecs) : C.encoder({ width, height, bitrate, fps }) → E ; E.add(canvas) après chaque rendu,
      horodatage exact n/fps ; E.finish() → { blob, bytes, frames, ms }. Le rendu peut être plus lent que le temps réel :
      le clip reste fluide (30 i/s). Conteneur WebM écrit ici (en-tête EBML, durée, grappes, index).
   2. Repli temps réel (MediaRecorder sur captureStream(0)) : C.live.start({ bitrate }) · C.live.frame() · C.live.stop().
   Voir docs/SPEC-P4-lecteur.md.
   ===================================================================== */
(function(){
'use strict';
const CL = window.__CLIP = {};

/* ---------- WebM (EBML) minimal : une piste vidéo, grappes à chaque image clé, index ---------- */
const u8 = a => a instanceof Uint8Array ? a : new Uint8Array(a);
const total = parts => parts.reduce((s, p) => s + p.length, 0);
function idBytes(id){ const b = []; while(id > 0){ b.unshift(id & 0xff); id = Math.floor(id/256); } return b; }
function vint(n){
  let len = 1; while(len < 8 && n >= Math.pow(2, 7*len) - 1) len++;
  const b = new Array(len); let x = n;
  for(let i = len - 1; i >= 0; i--){ b[i] = x % 256; x = Math.floor(x/256); }
  b[0] |= 1 << (8 - len); return b;
}
function el(id, parts){ parts = [].concat(parts || []).map(u8); return [u8(idBytes(id)), u8(vint(total(parts))), ...parts]; }
function uint(id, v){ const b = []; v = Math.max(0, Math.round(v)); do { b.unshift(v % 256); v = Math.floor(v/256); } while(v > 0); return el(id, [b]); }
function float(id, v){ const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, [b]); }
function str(id, s){ return el(id, [Array.from(s, c => c.charCodeAt(0) & 0x7f)]); }
CL.mux = function(chunks, o){
  const head = el(0x1A45DFA3, [...uint(0x4286, 1), ...uint(0x42F7, 1), ...uint(0x42F2, 4), ...uint(0x42F3, 8), ...str(0x4282, 'webm'), ...uint(0x4287, 4), ...uint(0x4285, 2)]);
  const info = el(0x1549A966, [...uint(0x2AD7B1, 1e6), ...float(0x4489, o.durationMs), ...str(0x4D80, 'voyage-spatial'), ...str(0x5741, 'voyage-spatial')]);
  const tracks = el(0x1654AE6B, el(0xAE, [...uint(0xD7, 1), ...uint(0x73C5, 1), ...uint(0x83, 1), ...str(0x86, o.codecId), ...uint(0x23E383, 1e9/o.fps),
    ...el(0xE0, [...uint(0xB0, o.width), ...uint(0xBA, o.height)])]));
  const clusters = [], cues = []; let pos = total(info) + total(tracks), cur = null;
  const flush = () => { if(!cur) return; const c = el(0x1F43B675, cur.parts); cues.push({ t: cur.t, pos }); pos += total(c); clusters.push(...c); cur = null; };
  chunks.forEach(ch => {
    const t = Math.round(ch.ts/1000);
    if(ch.key || !cur || t - cur.t > 30000){ flush(); cur = { t, parts: [...uint(0xE7, t)] }; }
    const rel = t - cur.t;
    cur.parts.push(...el(0xA3, [u8([0x81, (rel >> 8) & 0xff, rel & 0xff, ch.key ? 0x80 : 0]), ch.data]));
  });
  flush();
  const cuesEl = el(0x1C53BB6B, cues.flatMap(c => el(0xBB, [...uint(0xB3, c.t), ...el(0xB7, [...uint(0xF7, 1), ...uint(0xF1, c.pos)])])));
  return new Blob([...head, ...el(0x18538067, [...info, ...tracks, ...clusters, ...cuesEl])], { type: 'video/webm' });
};

CL.create = function(canvas){
  const MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const liveOK = !!(canvas.captureStream && window.MediaRecorder);
  const C = { offline: false, live: { supported: false, mime: '' }, frames: 0 };
  if(liveOK){ C.live.mime = MIMES.find(m => MediaRecorder.isTypeSupported(m)) || ''; C.live.supported = !!C.live.mime; }
  C.supported = C.live.supported;

  /* ---------- 1) image par image (WebCodecs) ---------- */
  const CODECS = h => [[h > 720 ? 'vp09.00.40.08' : 'vp09.00.31.08', 'V_VP9'], ['vp8', 'V_VP8']];
  async function pick(o){
    if(!window.VideoEncoder || !window.VideoFrame) return null;
    for(const [codec, codecId] of CODECS(o.height)){
      const cfg = { codec, width: o.width, height: o.height, bitrate: o.bitrate, framerate: o.fps, latencyMode: 'quality', bitrateMode: 'variable' };
      try{ const r = await VideoEncoder.isConfigSupported(cfg); if(r && r.supported) return { cfg, codecId }; }catch(e){}
    }
    return null;
  }
  C.ready = pick({ width: 1280, height: 720, bitrate: 5e6, fps: 30 }).then(p => { C.offline = !!p; C.supported = C.offline || C.live.supported; return C; });
  C.encoder = async function(o){
    o = Object.assign({ fps: 30, bitrate: 6e6 }, o);
    const p = await pick(o); if(!p) throw new Error('encodeur vidéo indisponible');
    const chunks = []; let err = null, n = 0;
    const enc = new VideoEncoder({ output: (ch) => { const d = new Uint8Array(ch.byteLength); ch.copyTo(d); chunks.push({ data: d, ts: ch.timestamp, key: ch.type === 'key' }); },
      error: e => { err = e; } });
    enc.configure(p.cfg);
    const step = 1e6/o.fps;
    return {
      get queue(){ return enc.encodeQueueSize; },
      get frames(){ return n; },
      add(cv){
        if(err) throw err;
        const f = new VideoFrame(cv || canvas, { timestamp: Math.round(n*step), duration: Math.round(step) });
        enc.encode(f, { keyFrame: n % (2*o.fps) === 0 }); f.close(); n++;
      },
      async finish(){
        await enc.flush(); enc.close(); if(err) throw err;
        const durationMs = n*1000/o.fps;
        const blob = CL.mux(chunks, { width: o.width, height: o.height, fps: o.fps, codecId: p.codecId, durationMs });
        return { blob, bytes: blob.size, frames: n, ms: durationMs, mime: 'video/webm;codecs=' + (p.codecId === 'V_VP9' ? 'vp9' : 'vp8') };
      },
      abort(){ try{ enc.close(); }catch(e){} }
    };
  };

  /* ---------- 2) repli temps réel (MediaRecorder) ---------- */
  let rec = null, track = null, parts = [], t0 = 0;
  C.live.start = function(o){
    if(!C.live.supported) throw new Error('export vidéo non pris en charge par ce navigateur');
    const stream = canvas.captureStream(0); track = stream.getVideoTracks()[0];
    rec = new MediaRecorder(stream, { mimeType: C.live.mime, videoBitsPerSecond: (o && o.bitrate) || 6e6 });
    parts = []; rec.ondataavailable = e => { if(e.data && e.data.size) parts.push(e.data); };
    rec.start();                         /* d'un seul bloc : Chrome écrit alors la durée et l'index */
    C.frames = 0; t0 = performance.now();
  };
  C.live.frame = function(){ if(rec && track){ (track.requestFrame || (() => {})).call(track); C.frames++; } };
  C.live.stop = function(){
    return new Promise((resolve, reject) => {
      if(!rec) return reject(new Error('aucun enregistrement'));
      const ms = performance.now() - t0;
      rec.onstop = () => {
        const blob = new Blob(parts, { type: C.live.mime.split(';')[0] });
        track.stop(); rec = null; track = null;
        resolve({ blob, bytes: blob.size, mime: C.live.mime, ms, frames: C.frames });
      };
      rec.onerror = e => reject(e.error || e);
      rec.stop();
    });
  };
  return C;
};
})();
