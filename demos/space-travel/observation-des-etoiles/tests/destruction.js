// combat IV (v7.16) : destruction — épave, explosions secondaires, boule de feu, onde de choc, débris, ralenti, recadrage ; node t75.js [duel|skirmish|convoy|raid|assault] [graine] [préfixe] ; CAP=1 : séquence d'explosion
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const kind = process.argv[2] || 'duel', seed = process.argv[3] || 'OBS-4', pre = process.argv[4] || 'e20' + kind[0];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:620}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&stopover=0&trip=0&combat=' + kind + '&destroy=' + (process.env.DESTROY || '1') + (process.env.CARRIER ? '&carrier=' + process.env.CARRIER : ''));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.getElementById('sttTitle').style.display = 'none'; });
 const shotPage = async (name) => { await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); }))); await p.waitForTimeout(90); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); }))); await p.screenshot({ path: `${pre}_${name}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 }); };
 const log = await p.evaluate(()=>{ const E = __CINE.engDbg(); while(__CINE.time() < E.tA - 1) __CINE.step(.25, true); const shots = [], toasts = [], booms = []; let last = null;
   const tt = document.getElementById('sttToast'); let lastToast = '';
   while(__CINE.time() < E.tB + 8){ const o = __CINE.step(1/30, true); if(o.shot !== last || __CINE.shotStart() !== window.__ls){ last = o.shot; window.__ls = __CINE.shotStart(); shots.push(Math.round(__CINE.time()) + ':' + o.shot); }
     const tx = tt ? tt.textContent : ''; if(tx && tx !== lastToast){ lastToast = tx; toasts.push(Math.round(__CINE.time()) + ' ' + tx.slice(0, 80)); } }
   return { shots, toasts, booms: __CINE.boomDbg(), deb: __CINE.debris(), E: __CINE.engDbg() }; });
 console.log('shots', log.shots.join(' ')); console.log('toasts', JSON.stringify(log.toasts)); console.log('booms', JSON.stringify(log.booms)); console.log('debris', log.deb, 'ships', log.E.ships.join(' '), 'over', log.E.over);
 if(process.env.CAP){ // séquence d'explosion filmée : engagement suivant, épave condamnée, plan wreckDrift imposé, captures autour de l'explosion
   const r = await p.evaluate(([kind])=>{ const r = __CINE.startCombat(kind); const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const E = __CINE.visit().eng;
     let d = null; while(!d && __CINE.time() < E.tB + 4){ __CINE.step(1/15, true); d = E.ships.filter(s => s.hp && s.hp.boom && !s.hp.dead && s.hp.boom > __CINE.time() + 1.5).sort((a, b) => b.len - a.len)[0]; }
     if(!d) return { r, none: true }; window.__doom = d; __CINE.forceShotOn('wreckDrift', d, d.hp.boom - __CINE.time() + 6); return { r, name: d.name, model: d.model, boom: d.hp.boom, T: __CINE.time() }; }, [kind]);
   console.log('cap', JSON.stringify(r));
   if(!r.none){ for(const [nm, dtB] of [['wreck', -1.2], ['blast', .1], ['fireball', .45], ['ring', 1.1], ['debris', 3.5]]){
       const info = await p.evaluate(([dtB])=>{ const d = window.__doom; while(__CINE.time() < d.hp.boom + dtB - 1/30){ __CINE.step(1/30, true); const c = __CINE.camDbg(); if(dtB < 2 && (!c || c.type !== 'wreckDrift' || __CINE.caption().name !== d.name)) __CINE.forceShotOn('wreckDrift', d, d.hp.boom - __CINE.time() + 4); } return { T: +__CINE.time().toFixed(2), dead: !!d.hp.dead, slow: __CINE.slow(), deb: __CINE.debris(), cam: __CINE.camDbg() }; }, [dtB]);
       console.log('at', nm, JSON.stringify(info)); await shotPage(nm); }
     const sm = await p.evaluate(()=>{ const t0 = __CINE.time(); for(let i = 0; i < 6; i++) __CINE.step(1/30, false); return +(__CINE.time() - t0).toFixed(3); }); console.log('slowmo 6 frames (0.2 s) → T advanced', sm); }
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
