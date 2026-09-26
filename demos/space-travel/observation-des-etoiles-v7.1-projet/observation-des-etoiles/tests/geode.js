const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const seed = process.argv[2] || 'OBS-2', offs = (process.argv[3] || '-2,0.3,1.2,2.1,2.8,3.2,3.9,4.6').split(',').map(Number);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) console.log('C', m.text().slice(0,600)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed+(process.env.QS||''));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ document.getElementById('sttStart').style.display='none'; });
 const tj = await p.evaluate(()=>{ for(let n=0;n<12;n++){ const v = __CINE.visit(); if(v.departer.geode && v.mode === 'jump') break; while(__CINE.time() < v.tEnd + .2) __CINE.step(0.1, true); }
   __CINE.visit().geodePlan = true; const t = __CINE.timings(); return { tJ: t.tJ, mode: t.mode, dep: t.departer, geode: !!__CINE.visit().departer.geode, T: __CINE.time() }; });
 console.log(JSON.stringify(tj));
 for(let i=0;i<offs.length;i++){
   const r = await p.evaluate(([t])=>{ while(__CINE.time() < t - 0.05) __CINE.step(0.05,true); const o = __CINE.step(0.02,false); const d = __CINE.visit().departer; return o.shot + ' charge=' + d.charge.value.toFixed(2) + ' k=' + Math.round(o.k); }, [tj.tJ + offs[i]]);
   await p.screenshot({path:`gd_${i}.jpg`,type:'jpeg',quality:85}); console.log((tj.tJ + offs[i]).toFixed(2), r);
 }
 await b.close();
})();
