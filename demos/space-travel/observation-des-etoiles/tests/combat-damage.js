// combat I (v7.13) : factions, jauges et étiquettes (DATA), dégâts pendant un exercice de tir, impacts, désemparé — node t72.js [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'k17';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:620}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=station&carrier=0&dof=0&stopover=0&trip=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 const shotPage = async (name) => { await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __LABELS._reset(); __CINE.step(1/30, false); res(); }))); await p.waitForTimeout(90); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/30, false); res(); }))); await p.screenshot({ path: `${pre}_${name}.jpg`, type: 'jpeg', quality: 86 }); };
 // exercice de tir : la cible perd son bouclier, puis sa coque, puis est désemparée ; cessez-le-feu
 const g = await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 1) __CINE.step(.25, true);
   let n = 0, w; while(!((w = __CINE.gunNow()) && w.active) && n++ < 200) __CINE.step(.25, true);
   const out = []; for(let i = 0; i < 16*30; i++){ __CINE.step(1/30, true); if(i % 30 === 0){ const c = __CINE.combatDbg(); out.push(Math.round(i/30) + 's ' + c.ships.filter(x => /target|destroyer/.test(x)).join(' ') + ' fx' + c.imp); } }
   return out; });
 g.forEach(l => console.log(l));
 await p.evaluate(()=>{ __CINE.forceShot('gunnery', 'destroyer'); for(let i = 0; i < 10; i++) __CINE.step(1/30, true); }); await shotPage('gunnery');
 // un chasseur touché jusqu'à être désemparé : étincelles, points chauds, gaz, dérive
 const f = await p.evaluate(()=>{ const r = __CINE.hitTest('fighter', 30, .06); __CINE.forceShotOn('orbitcam', __CINE.hitLast, 8); for(let i = 0; i < 45; i++) __CINE.step(1/30, true); return { r, lab: __CINE.labelsState(8) }; });
 console.log('fighter', JSON.stringify(f.r), 'labels', JSON.stringify(f.lab.map(l => l.name + ' ' + l.owner + ' h' + l.hull + (l.dis ? ' DIS' : '')))); await shotPage('disabled');
 await p.evaluate(()=>{ for(let i = 0; i < 60; i++) __CINE.step(1/30, true); }); await shotPage('disabled2');
 // plan large du groupe : étiquettes de tous les vaisseaux proches
 await p.evaluate(()=>{ __CINE.forceShot('formation', 'fighter'); for(let i = 0; i < 20; i++) __CINE.step(1/30, true); }); await shotPage('labels');
 const ls = await p.evaluate(()=>{ window.__LABELS._reset(); return new Promise(res => setTimeout(()=>res(window.__LABELS.stats()), 1200)); });
 console.log('labels stats', JSON.stringify(ls));
 // touche H : DATA coupé, mémorisé
 await p.keyboard.press('h'); await p.waitForTimeout(200);
 const off = await p.evaluate(()=>({ on: __LABELS.isOn(), store: localStorage.getItem('ode.data'), vis: [...document.querySelectorAll('#sttLabels .lb.on')].length, btn: document.getElementById('sttDataBtn').className }));
 console.log('data off', JSON.stringify(off));
 await p.keyboard.press('h');
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
