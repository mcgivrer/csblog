// réalisation II (v7.9) : plans-séquences — révélation, parallaxe d'anneaux, tour du système (captures + statistiques) — node t67.js [graine] [préfixe] [minutes]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 's9', mins = +(process.argv[4] || 0);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&dof=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .88); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 const seq = async (name, fn, d, times) => { const r = await p.evaluate(fn); console.log(name, '->', r); let t = 0; for(const [i, at] of times.entries()){ await p.evaluate((dt)=>{ const n = Math.round(dt*30); for(let k = 0; k < n; k++) __CINE.step(1/30, true); }, at - t); t = at; await snap(name + '_' + i); } };
 // 1) révélation (héros en orbite)
 await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 3) __CINE.step(.25, true); });
 await seq('reveal', ()=>{ __CINE.forceShot('reveal'); return __CINE.caption() && __CINE.caption().type; }, 24, [1, 8, 15, 21]);
 // 2) tour du système
 await seq('tour', ()=>__CINE.forceVista('tour', 24), 24, [2, 7, 13, 21]);
 // 3) anneaux : chercher un système avec une planète à anneaux
 const found = await p.evaluate(()=>{ for(let v = 0; v < 30; v++){ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 2) __CINE.step(.5, true); const r = __CINE.forceVista('ringParallax', 18); if(r === 'vista_ringParallax') return v; const te = __CINE.timings().tEnd; while(__CINE.time() < te + 1) __CINE.step(.5, true); } return -1; });
 console.log('rings visit', found);
 if(found >= 0) for(const [i, at] of [1, 7, 14].entries()){ await p.evaluate((dt)=>{ const n = Math.round(dt*30); for(let k = 0; k < n; k++) __CINE.step(1/30, true); }, i ? 6.5 : 1); await snap('rings_' + i); }
 if(mins > 0){ const st = await p.evaluate((mins)=>{ const out = {}; let last = null; const end = __CINE.time() + mins*60; while(__CINE.time() < end){ const o = __CINE.step(.1, true); if(o.shot !== last){ last = o.shot; out[o.shot] = (out[o.shot] || 0) + 1; } } return out; }, mins); console.log('shots', JSON.stringify(st)); }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
