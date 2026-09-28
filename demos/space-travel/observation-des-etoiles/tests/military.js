// flotte militaire (v7.4) : système avec station, patrouille et escorte (?military=all) ; plans dédiés ; carte et radar — node t62.js [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'mil';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=all&dof=1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const info = await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 4) __CINE.step(.25, true); for(let i = 0; i < 80 && !__CINE.radarState(); i++) __CINE.step(.25, true);   // plan de découverte : pas de radar
   const sh = __CINE.shipsInfo(), mil = sh.filter(s => s.mil);
   return { n: sh.length, mil: mil.map(s => s.type + ' ' + s.reg + ' ' + Math.round(s.len) + 'm'), radarMil: __CINE.radarState().contacts ? __CINE.radarState().contacts.filter(c => c.mil).length : null }; });
 console.log(JSON.stringify(info));
 const shots = [['formation', 'fighter'], ['turretClose', 'destroyer'], ['lateral', 'destroyer'], ['lateral', 'corvette'], ['turretClose', 'corvette'], ['chase', 'fighter']];
 for(const [ty, who] of shots){
   const r = await p.evaluate(([ty, who])=>{ __CINE.forceShot(ty, who); __CINE.step(2.0, true); __CINE.step(1/30, false); const w = __CINE.warpDbg(); return { shot: w.shot, img: renderer.domElement.toDataURL('image/jpeg', .86) }; }, [ty, who]);
   fs.writeFileSync(`${pre}_${ty}_${who}.jpg`, Buffer.from(r.img.split(',')[1], 'base64')); console.log(ty, who, '->', r.shot);
 }
 // plans choisis par le réalisateur sur 3 minutes
 const kinds = await p.evaluate(()=>{ const k = {}; for(let i = 0; i < 1800; i++){ const o = __CINE.step(.1, true); k[o.shot] = (k[o.shot] || 0) + 1; } return k; });
 console.log('kinds', JSON.stringify(kinds));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
