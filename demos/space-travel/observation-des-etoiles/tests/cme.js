// éjection de masse coronale : plan « éruption » forcé, captures pendant l'expansion — node t59.js [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-1', pre = process.argv[3] || 'cme';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&dof=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const k = await p.evaluate(()=>{ while(__CINE.time() < 30) __CINE.step(.25, true); return __CINE.forceVista('flare', 14); });
 console.log('vista', k);
 const marks = (process.env.MARKS || '2.5,4,5.5,7,8.5').split(',').map(Number);
 const T0 = await p.evaluate(()=>__CINE.time());
 for(const dt of marks){
   const img = await p.evaluate((tt)=>{ while(__CINE.time() < tt - .05) __CINE.step(1/30, true); __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .88); }, T0 + dt);
   fs.writeFileSync(`${pre}_${dt}.jpg`, Buffer.from(img.split(',')[1], 'base64'));
 }
 console.log('errors', errs.length, errs.slice(0, 2)); await b.close();
})();
