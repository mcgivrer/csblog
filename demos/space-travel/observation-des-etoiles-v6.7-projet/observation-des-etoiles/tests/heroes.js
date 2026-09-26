// rotation des héros : sur 20 min simulées, héros distincts et plus longue série sur un même vaisseau
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const seed of process.argv.slice(2)){
 const p=await b.newPage({viewport:{width:320,height:180}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 const r = await p.evaluate(()=>{ const seq = []; let lastV = null, subj = {};
   for(let i=0;i<12000;i++){ __CINE.step(0.1, true); const v = __CINE.visit(); if(v !== lastV){ lastV = v; seq.push(v.hero.name + '|' + v.hero.model); }
     const c = __CINE.caption(); if(c && c.name) subj[c.name] = (subj[c.name] || 0) + 1; }
   return { seq, subj }; });
 let streak = 1, maxS = 1; for(let i=1;i<r.seq.length;i++){ if(r.seq[i] === r.seq[i-1]) { streak++; maxS = Math.max(maxS, streak); } else streak = 1; }
 const heroes = new Set(r.seq);
 const top = Object.entries(r.subj).sort((a,b)=>b[1]-a[1]).slice(0,4).map(e => e[0] + ':' + Math.round(e[1]/120) + '%');
 console.log(seed, 'visits', r.seq.length, 'distinct heroes', heroes.size, 'max streak', maxS, 'top subjects', top.join(' '), 'errors', errs.length);
 await p.close(); }
 await b.close();
})();
