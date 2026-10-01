// mémoire (v7.19) : longue session pas à pas en tâches séparées (comme des images réelles), ramasse-miettes complet aux jalons ;
// tas JavaScript, objets three.js vivants, vaisseaux libérés encore en mémoire, ressources GPU ; verdict sur la pente
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
// node t78.js [graine] [durée simulée en s] — ex. node t78.js LONG-10 3600
const { chromium } = require('playwright');
(async()=>{
 const seed = process.argv[2] || 'LONG-10', D = +(process.argv[3] || 3600), TS = [300, D/3, 2*D/3, D].map(Math.round);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-precise-memory-info','--js-flags=--expose-gc']});
 const p=await b.newPage({viewport:{width:640,height:360}}); const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 const cdp = await p.context().newCDPSession(p); await cdp.send('HeapProfiler.enable');
 const count = async proto => { const g = 'cnt'; const { result } = await cdp.send('Runtime.evaluate', { expression: proto, objectGroup: g }); const q = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId, objectGroup: g });
   const r = await cdp.send('Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function(){ let n = 0; for(const o of this) if(o.uuid) n++; return n; }', returnByValue: true });
   await cdp.send('Runtime.releaseObjectGroup', { objectGroup: g }); return r.result.value; };   // libère le tableau renvoyé (sinon l'outil de mesure retient lui-même les objets)
 const rows = [];
 for(const T of TS){
   while(await p.evaluate(T => { const e = Math.min(T, __CINE.time() + 5); while(__CINE.time() < e) __CINE.step(1/10, true); return __CINE.time() < T; }, T)){}   // 5 s simulées par tâche
   await p.evaluate(()=>new Promise(r => setTimeout(r, 0))); await cdp.send('HeapProfiler.collectGarbage');
   const m = await p.evaluate(()=>({ heap: Math.round(performance.memory.usedJSHeapSize/1e6), L: __CINE.leakDbg ? __CINE.leakDbg() : null, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, ships: __CINE.debug().ships }));
   const row = { T, heap: m.heap, obj3d: await count('THREE.Object3D.prototype'), geos: await count('THREE.BufferGeometry.prototype'), mats: await count('THREE.Material.prototype'), deadAlive: m.L ? m.L.aliveDisposed : null, gpuGeo: m.geo, gpuTex: m.tex, ships: m.ships };
   rows.push(row); console.log(JSON.stringify(row));
 }
 const a = rows[1], z = rows[rows.length - 1], hours = (z.T - a.T)/3600, slope = (z.heap - a.heap)/hours, objSlope = (z.obj3d - a.obj3d)/hours;
 const ok = slope < 40 && objSlope < 1500 && (z.deadAlive === null || z.deadAlive < 60);
 console.log('slope', slope.toFixed(1), 'MB/h', 'objects', objSlope.toFixed(0), '/h', 'verdict', ok ? 'STABLE' : 'GROWING', 'errors', errs.length, errs.slice(0, 2)); await b.close();
})();
