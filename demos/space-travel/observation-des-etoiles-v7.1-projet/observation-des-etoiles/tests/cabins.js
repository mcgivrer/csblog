// lot 4 : cabines reconstituées par modèle (comptes du catalogue), rotation du cadre de la géode, captures des suites
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported sources/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3') + '&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const out = await p.evaluate(()=>{
   const CAT = { e18: 0, e140: 0, p10: 4, p44: 4, g1: 3, tS: 2, tM: 6, tL: 9, l20: 20, x1: 2 }, res = {};
   SHIPGEN.MODELS.forEach(m => { const bb = SHIPGEN.build(m.id, { warp: true, jump: true }); const g = bb.glass || {}; res[m.id] = { cabins: g.cabins || 0, ports: g.cabinPorts || 0, panos: g.panos || 0, ok: (g.cabins || 0) + (g.panos || 0) === 2*CAT[m.id] }; SHIPGEN.dispose(bb.group); });
   return res; });
 // rotation de la géode autour d'un saut
 await p.click('#sttStart'); await p.waitForTimeout(300);
 out.geode = await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; const C = __CINE; let n = 0; while(!(C.visit().mode === 'jump' && C.visit().departer.geode) && n++ < 30){ const c0 = C.visit().leg.cell; let k = 0; while(C.visit().leg.cell === c0 && k++ < 4000) C.step(0.1, true); }
   const v = C.visit(), sh = v.departer; if(!sh.geode) return 'no geode';
   const a = C.geodeSpin(sh, v.tJ - 2, v.tJ + 6, 16), w = a.slice(1).map((x, i) => +((x - a[i])/.5/(2*Math.PI)).toFixed(2));   // tours par seconde par demi-seconde
   return { model: sh.model, jumpTs: (sh.jumpTs || []).map(x => +x.toFixed(1)), tJ: +v.tJ.toFixed(1), turnsPerSec: w }; });
 console.log(JSON.stringify(Object.assign(out, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
