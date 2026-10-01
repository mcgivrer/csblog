// escale au porteur (v7.10) : réalisation automatique — capture les plans d'escale choisis par le réalisateur — node t69.js [graine] [préfixe] [civil|mil] [minutes] [max]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-7', pre = process.argv[3] || 'ba', pc = process.argv[4] || 'civil', mins = +(process.argv[5] || 8), max = +(process.argv[6] || 8);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&carrier=' + pc);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const B = ['berthApproach', 'berthDepart', 'fieldCross', 'controlRoom', 'deckLevel'];
 let n = 0, visits = 0, withB = 0; const tEnd = mins*60;
 while(n < max){
   const r = await p.evaluate(([B, tEnd])=>{ let o; const v0 = __CINE.visit(); while(__CINE.time() < tEnd){ o = __CINE.step(1/10, true); if(B.includes(o.shot) && __CINE.time() - __CINE.shotStart() > 1.5) break; }
     return { T: __CINE.time(), shot: o.shot, cap: o.cap && o.cap.name, b: __CINE.berthDbg(), newVisit: __CINE.visit() !== v0 }; }, [B, tEnd]);
   if(!B.includes(r.shot)) break;
   const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .86); });
   fs.writeFileSync(`${pre}_${n}_${r.shot}.jpg`, Buffer.from(img.split(',')[1], 'base64')); console.log(n, r.T.toFixed(1), r.shot, r.cap, r.b && r.b.ph + ':' + r.b.u, r.b && r.b.ship); n++;
   await p.evaluate(()=>{ const s0 = __CINE.shotStart(); while(__CINE.shotStart() === s0) __CINE.step(1/10, true); });   // plan suivant
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
