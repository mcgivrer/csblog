// escale au porte-vaisseaux (v7.10) : cycle approche → glissement → pinces → sortie, plans dédiés, statistiques — node t68.js [graine] [préfixe] [civil|mil] [minutes]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'b10', pc = process.argv[4] || 'civil', mins = +(process.argv[5] || 8);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&carrier=' + pc);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .88); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 const r0 = await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 2) __CINE.step(.25, true); for(let i = 0; i < 40 && !__CINE.berthDbg(); i++) __CINE.step(.25, true); return { car: __CINE.carrierDbg(), b: __CINE.berthDbg(), T: __CINE.time(), dep: t.depStart }; });
 console.log('present', JSON.stringify(r0));
 const kind = r0.car && r0.car.kind;
 const cap = async (ph, u, type, name, lead) => { const r = await p.evaluate(([ph, u, t, k, lead])=>{ const plan = __CINE.forceBerth(ph, u); __CINE.forceShot(t, k); for(let i = 0; i < Math.round(lead*30); i++) __CINE.step(1/30, true);
     renderer.info.autoReset = false; renderer.info.reset(); const t0 = performance.now(); __CINE.step(1/60, false); const ms = performance.now() - t0, calls = renderer.info.render.calls; renderer.info.autoReset = true;
     return Object.assign({ calls, ms: Math.round(ms), T: +__CINE.time().toFixed(1) }, __CINE.berthDbg()); }, [ph, u, type, kind, lead || .5]); console.log(name, JSON.stringify(r)); await snap(name); };
 const shots = (process.env.SHOTS || 'approach:.55:berthApproach,approach:.9:berthApproach,slide:.22:fieldCross,slide:.45:deckLevel,slide:.7:controlRoom,clamp:.6:deckLevel,docked:.2:controlRoom,exit:.35:fieldCross,depart:.2:berthDepart,depart:.6:berthDepart').split(',');
 for(const [i, sp] of shots.entries()){ const [ph, u, t] = sp.split(':'); await cap(ph, +u, t, i + '_' + ph + '_' + t); }
 // enchaînement automatique : fréquence des plans d'escale
 const st = await p.evaluate(([mins])=>{ const k = {}, ph = {}; let last = null, n = 0; const t1 = __CINE.time() + mins*60;
   while(__CINE.time() < t1){ const o = __CINE.step(.1, true); const bd = __CINE.berthDbg(); if(bd) ph[bd.ph] = (ph[bd.ph] || 0) + 1; if(o.shot !== last){ k[o.shot] = (k[o.shot] || 0) + 1; last = o.shot; n++; } }
   return { k, ph, n, carrier: !!__CINE.carrierDbg() }; }, [mins]);
 console.log('stats', JSON.stringify(st));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
