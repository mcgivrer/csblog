const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:320,height:180}});
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=OBS-1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 const r = await p.evaluate(()=>{ const out = {}; ['e18','e140','p10','p44','g1','tS','tM','tL','l20','x1'].forEach(m => { const cnt = g => { let n = 0; g.traverse(o => { if(o.isMesh || o.isLineSegments) n++; }); return n; };
   const a = SHIPGEN.build(m, { realGlass: false }), c = SHIPGEN.build(m, {}); out[m] = [cnt(a.group), cnt(c.group), c.glass ? c.glass.count : 0]; SHIPGEN.dispose(a.group); SHIPGEN.dispose(c.group); }); return out; });
 console.log(JSON.stringify(r)); await b.close();
})();
