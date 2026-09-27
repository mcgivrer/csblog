// anneaux de distorsion (v7.2) : départ en distorsion filmé — pré-charge, charge, engagement ; node t58.js [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-1', pre = process.argv[3] || 'ring';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&dof=1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; });
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const tm = await p.evaluate(()=>{ let tm = __CINE.timings(), g = 0;
   while((tm.mode !== 'warp' || !__CINE.warpDbg().rings) && g++ < 14){ const te = tm.tEnd + 1; while(__CINE.time() < te) __CINE.step(0.5, true); tm = __CINE.timings(); }
   const t0 = tm.tJ - 6; while(__CINE.time() < t0) __CINE.step(0.25, true); return tm; });
 console.log(JSON.stringify({ mode: tm.mode, dep: tm.departer, tJ: +tm.tJ.toFixed(2), tEng: tm.tEng && +tm.tEng.toFixed(2), tCru: tm.tCru && +tm.tCru.toFixed(2) }));
 const marks = (process.env.MARKS || '-2.5,-1,.6,1.6,2.4,3.2,3.8,4.3,4.75,5.0,5.6,6.6,7.8').split(',').map(Number), rows = [];
 for(const dt of marks){
   const r = await p.evaluate((tt)=>{ while(__CINE.time() < tt - .05) __CINE.step(1/30, true); __CINE.step(1/30, false);
     return { T: +__CINE.time().toFixed(2), w: __CINE.warpDbg(), img: renderer.domElement.toDataURL('image/jpeg', .85) }; }, tm.tJ + dt);
   fs.writeFileSync(`${pre}_${String(dt).replace('-', 'm')}.jpg`, Buffer.from(r.img.split(',')[1], 'base64'));
   delete r.img; rows.push(Object.assign({ dt }, r));
 }
 rows.forEach(r => console.log(JSON.stringify(r)));
 console.log('errors', errs.length, errs.slice(0, 3));
 await b.close();
})();
