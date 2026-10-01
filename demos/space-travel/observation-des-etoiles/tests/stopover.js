// escale interplanétaire (v7.12) : orbite A, transfert vers B, orbite B, départ — continuité, plans, carte — node t71.js [graine] [préfixe] [visites]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'st', nv = +(process.argv[4] || 3);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&carrier=0&dof=0&stopover=1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .86); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 for(let v = 0; v < nv; v++){
   const t = await p.evaluate(()=>__CINE.timings()); console.log('visit', v, JSON.stringify({ stop: t.stop, tO0: +t.tO0.toFixed(1), depStart: +t.depStart.toFixed(1), tJ: +t.tJ.toFixed(1), handover: t.handover, dep: t.departer }));
   if(t.stop){
     // continuité de la trajectoire du héros aux raccords (vitesse écran et saut de position)
     const c = await p.evaluate(()=>{ const v = __CINE.visit(), h = v.hero, s = v.stop, out = {};
       [['A1', s.tA1], ['B0', s.tB0]].forEach(([k, t]) => { const a = h.traj(t - .02).pos, b = h.traj(t).pos, c = h.traj(t + .02).pos; out[k] = { v1: Math.round(b.distanceTo(a)/.02), v2: Math.round(c.distanceTo(b)/.02), seg: h.traj(t + .02).seg }; }); return out; });
     console.log('  joins', JSON.stringify(c));
     // captures : fin d'orbite A, départ vers B (leaveOrbit), approche de B (planetApproach), orbite B
     const cap = async (t, type, name) => { const r = await p.evaluate(([t, type])=>{ while(__CINE.time() < t) __CINE.step(.1, true); if(type) __CINE.forceShotOn(type, __CINE.visit().hero, 8); for(let i = 0; i < (type ? 20 : 0); i++) __CINE.step(1/30, true); const m = __CINE.mapState(); return { T: +__CINE.time().toFixed(1), type: __CINE.step(0, true).shot, shot: __CINE.caption() && (__CINE.caption().name + ' / ' + __CINE.caption().planet), phase: m.phase, stop: m.stop, k: +__CINE.rate().toFixed(0) }; }, [t, type]); console.log('  cap', name, JSON.stringify(r)); await snap(v + '_' + name); };
     await cap(t.stop.tA1 - 1, null, 'leave0'); await cap(t.stop.tA1 + .8, null, 'leave1'); await cap(t.stop.tA1 + 2.2, null, 'leave2');
     await cap(t.stop.tB0 - 2.6, null, 'approach0'); await cap(t.stop.tB0 - 1.2, null, 'approach1'); await cap(t.stop.tB0 + .8, null, 'approach2');
     await cap(t.stop.tB0 + 5, 'orbitcam', 'orbitB');
   }
   // suite naturelle jusqu'à la visite suivante : types de plans
   const k = await p.evaluate(()=>{ const v0 = __CINE.visit(), k = {}; let last = null; while(__CINE.visit() === v0){ const o = __CINE.step(.1, true); if(o.shot !== last){ last = o.shot; k[o.shot] = (k[o.shot] || 0) + 1; } } return k; });
   console.log('  shots', JSON.stringify(k));
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
