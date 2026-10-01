// porte-vaisseaux dans la démo (v7.6) : présence, plans dédiés, ombre de soute, panneau FLEET — node t65.js [graine] [préfixe] [carrier=civil|mil|1]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'c6', pc = process.argv[4] || 'civil';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&carrier=' + pc);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .88); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 const r0 = await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 2) __CINE.step(.25, true); for(let i = 0; i < 40 && !__CINE.carrierDbg(); i++) __CINE.step(.25, true); return __CINE.carrierDbg(); });
 console.log('present', JSON.stringify(r0));
 for(const t of ['dockPass', 'dockInterior', 'dockBerth', 'torchClose', 'radiatorPass', 'lateral']){
   const r = await p.evaluate(([t, k])=>{ window.__P0 = window.__P0 || renderer.info.programs.map(q => q.name + '|' + q.cacheKey.slice(0, 60)); __CINE.forceShot(t, k); for(let i = 0; i < 45; i++) __CINE.step(1/30, true);
     renderer.info.autoReset = false; renderer.info.reset(); const t0 = performance.now(); __CINE.step(1/60, false); const ms = performance.now() - t0; const calls = renderer.info.render.calls; renderer.info.autoReset = true;
     return Object.assign({ calls, ms: Math.round(ms), progs: renderer.info.programs.length, pw: __CINE.prewarmMs }, __CINE.carrierDbg()); }, [t, r0 && r0.kind]);
   console.log(t, JSON.stringify(r)); await snap(t);
 }
 const f = await p.evaluate(()=>{ document.getElementById('sttFleetBtn').click(); const on = document.getElementById('sttFleet').classList.contains('on');
   document.querySelector('#sttFleet button[data-k="carrier"]').click(); for(let i = 0; i < 10; i++) __CINE.step(1/30, true);
   return { on, toast: document.getElementById('sttToast').textContent, sc: __CINE.timings().showcase, shot: __CINE.carrierDbg() && __CINE.carrierDbg().shot }; });
 console.log('fleet', JSON.stringify(f));
 const kinds = await p.evaluate(()=>{ const k = {}; for(let i = 0; i < 400; i++){ const o = __CINE.step(.1, true); k[o.shot] = (k[o.shot] || 0) + 1; } return k; });
 console.log('kinds', JSON.stringify(kinds));
 if(process.env.PROGS) console.log(await p.evaluate(()=>renderer.info.programs.map(q => q.name + '|' + q.cacheKey.slice(0, 60)).filter(x => !window.__P0.includes(x)).join('\n')));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
