// liste des modèles présents (héros + trafic) au début de la visite pour une graine
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const seed of process.argv.slice(2)){
 const p=await b.newPage({viewport:{width:320,height:180}});
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 const r = await p.evaluate(()=>{ __CINE.step(0.1,true); const v = __CINE.visit(); return { hero: v.hero.model, dep: v.departer && v.departer.model, npcs: (v.leg.npcs||[]).map(s=>s.model) }; });
 console.log(seed, JSON.stringify(r)); await p.close(); }
 await b.close();
})();
