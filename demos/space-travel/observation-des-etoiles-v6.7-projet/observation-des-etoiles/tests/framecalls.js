const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:640,height:360}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+(process.argv[2]||'OBS-8'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 const r = await p.evaluate(()=>{ renderer.info.autoReset = false; const out = [];
   for(let k=0;k<40;k++){ for(let i=0;i<30;i++) __CINE.step(0.1,true); renderer.info.reset(); __CINE.step(1/60,false); out.push([Math.round(__CINE.time()), __CINE.caption().type || 'vista', renderer.info.render.calls, Math.round(renderer.info.render.triangles/1000)]); }
   return out; });
 const calls = r.map(x => x[2]).sort((a,b)=>a-b); console.log('median calls', calls[calls.length>>1], 'p90', calls[Math.floor(calls.length*.9)], 'max', calls[calls.length-1]);
 console.log(r.map(x => x.join(':')).join(' ')); await b.close();
})();
