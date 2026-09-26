const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const f = process.argv[2];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:640,height:360}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 p.on('console',m=>{ const t=m.text(); if(m.type()==='error' && !/ERR_FAILED/.test(t)) errs.push(t.slice(0,200)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (f || 'dist/observation-des-etoiles.min.html') + '?seed=MIN-3');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart');
 await p.waitForTimeout(4000);
 // accéléré ensuite, sans rendu, sur 3 systèmes
 const r = await p.evaluate(()=>{ for(let i=0;i<2000;i++) __CINE.step(0.1,true); return {T:__CINE.time().toFixed(0), cap:__CINE.caption()}; });
 console.log(f, JSON.stringify(r), 'errors:', errs.length, errs.slice(0,3));
 await b.close();
})();
