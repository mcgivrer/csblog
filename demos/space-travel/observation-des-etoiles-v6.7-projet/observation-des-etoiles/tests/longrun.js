const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const seed = process.argv[2] || 'LONG-10';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:640,height:360}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300)));
 p.on('console',m=>{ const t=m.text(); if(m.type()==='error' && !/ERR_FAILED/.test(t)) errs.push(t.slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 for(let k=0;k<12;k++){
   const r = await p.evaluate(()=>{ const t0=performance.now(); const kinds = (window.__K = window.__K || {}); for(let i=0;i<1000;i++){ const o = __CINE.step(0.1,true); kinds[o.shot] = (kinds[o.shot]||0)+1; } const ms = (performance.now()-t0)/1000;
     return { T: Math.round(__CINE.time()), msStep: +ms.toFixed(2), dbg: __CINE.debug(), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : 0, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, shots: Object.keys(kinds).length, tim: __CINE.timings().mode + '/' + __CINE.timings().arrMode }; });
   console.log(JSON.stringify(r));
 }
 const rt = await p.evaluate(()=>{ const out=[]; for(let i=0;i<5;i++){ const t0=performance.now(); __CINE.step(1/60,false); renderer.getContext().finish(); out.push(Math.round(performance.now()-t0)); } return out; });
 console.log('kinds', JSON.stringify(await p.evaluate(()=>window.__K)));
 console.log('render ms (swiftshader)', rt, 'errors', errs.length, errs.slice(0,5));
 await b.close();
})();
