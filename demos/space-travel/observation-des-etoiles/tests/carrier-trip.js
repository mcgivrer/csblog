// voyage à bord d'un porte-vaisseaux (v7.11) : départ du porteur avec son passager, arrivée, débarquement, tour libre, réembarquement,
// sélecteur en mode Suivre, carte et radar « à bord de » — node t70.js [graine] [préfixe] [visites]
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const { chromium } = require('playwright');
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'tr', nv = +(process.argv[4] || 4);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&carrier=civil&trip=1&relay=1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .86); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 // parcours de plusieurs visites : journal des voyages, captures aux moments clés
 const log = [];
 for(let v = 0; v < nv; v++){
   const r = await p.evaluate(()=>{ const v0 = __CINE.visit(), out = []; let last = null;
     while(__CINE.visit() === v0){ const o = __CINE.step(.1, true), d = __CINE.tripDbg(); const k = o.shot + '|' + (d.ph || '');
       if(k !== last){ last = k; out.push([d.T, o.shot, d.ph, d.u, d.aboard, d.Xvis, d.Kvis, (o.cap && o.cap.name || '').slice(0, 48)].join(' ')); } if(out.length > 60) break; }
     return { lines: out, d: __CINE.tripDbg(), map: __CINE.mapState().hero }; });
   console.log('--- visit', v, JSON.stringify(r.d), 'mapHero', JSON.stringify(r.map)); r.lines.forEach(l => console.log('  ', l));
 }
 // visite en cours : si c'est un voyage, captures forcées des phases
 const d0 = await p.evaluate(()=>__CINE.tripDbg()); console.log('now', JSON.stringify(d0));
 const go = t => p.evaluate(t => { while(__CINE.time() < t) __CINE.step(.1, true); return __CINE.tripDbg(); }, t);
 if(d0.trip){
   const K = await p.evaluate(()=>{ const v = __CINE.visit(); return v.trip.K.model; });
   const shots = [[d0.tO0 + 2.5, 'deckLevel', 'release'], [d0.tO0 + 9, 'fieldCross', 'exit'], [d0.tO0 + 20, 'chase', 'roam'], [d0.tO0 + 26, 'lateral', 'roam2'], [d0.tO0 + 39, 'fieldCross', 'slide'], [d0.tO0 + 47.5, 'controlRoom', 'clamp']];
   for(const [t, type, nm] of shots){ const dd = await go(t); const who = nm.startsWith('roam') ? 'X' : 'K';
     await p.evaluate(([type, who])=>{ const v = __CINE.visit(); __CINE.forceShotOn(type, who === 'X' ? v.trip.X : v.trip.K); for(let i = 0; i < 12; i++) __CINE.step(1/30, true); }, [type, who]);
     console.log('cap', nm, JSON.stringify(await p.evaluate(()=>__CINE.tripDbg()))); await snap(nm); }
   const rs = await p.evaluate(()=>{ const r = __CINE.radarState(), si = __CINE.shipsInfo().filter(s => s.carrying && s.carrying.length); return { radar: r && { reg: r.reg, aboard: r.aboard, n: r.contacts.length }, carriers: si.map(s => s.name + ' [' + s.carrying.join(', ') + '] hero=' + s.hero) }; });
   console.log('mapradar', JSON.stringify(rs));
   // départ et saut du porteur : les vaisseaux à bord disparaissent avec lui
   const t = await p.evaluate(()=>__CINE.timings()); await go(t.tJ + 1); await snap('charge');
   const j = await p.evaluate(()=>{ const v = __CINE.visit(), X = v.trip.X, K = v.trip.K; const out = []; for(let i = 0; i < 70; i++){ __CINE.step(1/15, true); if(i % 10 === 0) out.push([+__CINE.time().toFixed(1), K.root.visible, X.root.visible, +K.inner.scale.z.toFixed(2), +X.inner.scale.z.toFixed(2)].join('/')); } return out.join(' '); });
   console.log('jump', j);
 }
 // sélecteur, mode Suivre : un vaisseau sans moyen de saut part à bord d'un porteur
 const sel = await p.evaluate(()=>{ const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 1) __CINE.step(.25, true);
   __CINE.setFollow(true); const r = __CINE.setHero('tM'); return { r, d: __CINE.tripDbg() }; });
 console.log('selector', JSON.stringify(sel));
 const nxt = await p.evaluate(()=>{ const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 3) __CINE.step(.25, true); return __CINE.tripDbg(); });
 console.log('next', JSON.stringify(nxt));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
