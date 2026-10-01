// coque brisée (v7.17) : découpe préparée pendant l'épave, tronçons qui dérivent, cassures incandescentes, plan hulkPass ; node t76.js [duel|raid|convoy|assault] [graine] [préfixe] ; CAP=1 : captures
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const kind = process.argv[2] || 'duel', seed = process.argv[3] || 'OBS-4', pre = process.argv[4] || 'e21' + kind[0];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:620}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&stopover=0&trip=0&combat=' + kind + '&destroy=1&hullbreak=' + (process.env.HB || '1'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.getElementById('sttTitle').style.display = 'none'; });
 const shotPage = async (name) => { await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); }))); await p.waitForTimeout(90); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); }))); await p.screenshot({ path: `${pre}_${name}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 }); };
 const log = await p.evaluate(()=>{ const E = __CINE.engDbg(); while(__CINE.time() < E.tA - 1) __CINE.step(.25, true); const shots = [], toasts = [], splits = []; let last = null, seen = {};
   const tt = document.getElementById('sttToast'); let lastToast = '';
   while(__CINE.time() < Math.min(E.tB + 40, __CINE.visit().depStart - 1)){ const o = __CINE.step(1/30, true); if(o.shot !== last || __CINE.shotStart() !== window.__ls){ last = o.shot; window.__ls = __CINE.shotStart(); shots.push(Math.round(__CINE.time()) + ':' + o.shot); }
     __CINE.splitDbg().forEach(x => { if(x.ready && !seen[x.n]){ seen[x.n] = 1; splits.push(x); } });
     const tx = tt ? tt.textContent : ''; if(tx && tx !== lastToast){ lastToast = tx; toasts.push(Math.round(__CINE.time()) + ' ' + tx.slice(0, 90)); } }
   return { shots, toasts, splits, hulks: __CINE.hulkDbg() }; });
 console.log('shots', log.shots.join(' ')); console.log('toasts', JSON.stringify(log.toasts)); console.log('splits', JSON.stringify(log.splits)); console.log('hulks', JSON.stringify(log.hulks));
 if(process.env.CAP){
   const r = await p.evaluate(([kind])=>{ const r = __CINE.startCombat(kind); const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const E = __CINE.visit().eng;
     let d = null; while(!d && __CINE.time() < E.tB + 4){ __CINE.step(1/15, true); d = E.ships.filter(s => s.hp && s.hp.boom && s.hp.split && !s.hp.dead && s.hp.boom > __CINE.time() + 1.5).sort((a, b) => b.len - a.len)[0]; }
     if(!d) return { r, none: true }; window.__doom = d; __CINE.forceShotOn('wreckDrift', d, d.hp.boom - __CINE.time() + 6); return { r, name: d.name, model: d.model, boom: d.hp.boom, T: __CINE.time() }; }, [kind]);
   console.log('cap', JSON.stringify(r));
   if(!r.none){
     const calls = async () => p.evaluate(()=>{ renderer.info.reset(); __CINE.step(1/60, false); return renderer.info.render.calls; });
     for(const [nm, dtB, force] of [['wreck', -1.2, 'wreckDrift'], ['break', .15, 'wreckDrift'], ['fire', 1.0, 'wreckDrift'], ['sections', 2.6, 'wreckDrift'], ['hulk8', 9, 'hulkPass'], ['hulk30', 30, 'hulkPass']]){
       const info = await p.evaluate(([dtB, force])=>{ const d = window.__doom; let forced = false;
         while(__CINE.time() < d.hp.boom + dtB - 1/30){ __CINE.step(1/30, true); const c = __CINE.camDbg();
           if(force === 'wreckDrift' && (!c || c.type !== 'wreckDrift' || __CINE.caption().name !== d.name) && __CINE.time() < d.hp.boom + 3) __CINE.forceShotOn('wreckDrift', d, 8);
           if(force === 'hulkPass' && !forced && __CINE.time() > d.hp.boom + dtB - 3.2){ const H = __CINE.hulkSubj(d.name); if(H){ __CINE.forceShotOn('hulkPass', H, 8); forced = true; } } }
         return { T: +__CINE.time().toFixed(2), smk: __CINE.smk(), dead: !!d.hp.dead, hulks: __CINE.hulkDbg(), cam: __CINE.camDbg() }; }, [dtB, force]);
       console.log('at', nm, JSON.stringify(info).slice(0, 400)); await shotPage(nm); if(nm === 'wreck' || nm === 'hulk8') console.log('calls', nm, await calls()); }
   }
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
