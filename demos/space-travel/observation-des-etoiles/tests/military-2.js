// flotte militaire II (v7.5) : catapultage, exercice de tir, panneau FLEET — node t63.js [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'm2';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=station&dof=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .86); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 // 1) exercice de tir : attendre une fenêtre active en temps réel
 const g = await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 2) __CINE.step(.25, true);
   let n = 0, w; while(!((w = __CINE.gunNow()) && w.active) && n++ < 200) __CINE.step(.25, true);   // fenêtre ouverte dès que le temps est réel
   for(let i = 0; i < 75; i++) __CINE.step(1/30, true);                                                    // 2,5 s de tir
   __CINE.forceShot('gunnery', 'destroyer'); for(let i = 0; i < 15; i++) __CINE.step(1/30, true); return Object.assign({ n }, __CINE.gunDbg()); });
 console.log('gun', JSON.stringify(g)); await snap('gunnery');
 await p.evaluate(()=>{ __CINE.forceShot('turretClose', 'destroyer'); for(let i = 0; i < 20; i++) __CINE.step(1/30, true); }); await snap('turret_fire');
 // 2) catapultage : forcer une manœuvre de baie sur le destroyer
 const bays = await p.evaluate(()=>__CINE.bayList());
 console.log('bays', JSON.stringify(bays));
 const r2 = await p.evaluate(()=>{ const r = __CINE.forceBay(0, 'destroyer', .5); for(let i = 0; i < 45; i++) __CINE.step(1/30, true); return r; });
 console.log('forceBay', r2); await snap('launch_a');
 await p.evaluate(()=>{ for(let i = 0; i < 40; i++) __CINE.step(1/30, true); }); await snap('launch_b');
 // 3) panneau FLEET (clic dans l'interface)
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; });
 const f = await p.evaluate(()=>{ document.getElementById('sttFleetBtn').click(); const on = document.getElementById('sttFleet').classList.contains('on');
   document.querySelector('#sttFleet button[data-k="patrol"]').click(); return { on, after: document.getElementById('sttFleet').classList.contains('on'), toast: document.getElementById('sttToast').textContent, sc: __CINE.timings().showcase }; });
 console.log('fleet', JSON.stringify(f));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
