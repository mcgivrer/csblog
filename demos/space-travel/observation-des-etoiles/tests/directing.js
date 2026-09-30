// réalisation I (v7.7) : nouveaux plans (captures) et statistiques (éclipses par système, durées des travellings) — node t66.js [graine] [préfixe] [minutes simulées]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'r7', mins = +(process.argv[4] || 20);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&dof=0' + (process.env.Q || ''));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(200);
 const snap = async (name) => { const img = await p.evaluate(()=>{ __CINE.step(1/30, false); return renderer.domElement.toDataURL('image/jpeg', .88); }); fs.writeFileSync(`${pre}_${name}.jpg`, Buffer.from(img.split(',')[1], 'base64')); };
 // 1) contre-champ d'arrivée (premier système) : avant l'éclair, éclair, approche
 const a = await p.evaluate(()=>{ const t = __CINE.timings(); __CINE.forceShot('arriveFront'); return t; }); console.log('arrive', a.tArrive.toFixed(1), a.tT0.toFixed(1));
 for(const [dt, n] of [[-.4, 'arrF_a'], [1.0, 'arrF_b'], [2.4, 'arrF_c']]){ await p.evaluate(([ta, dt])=>{ while(__CINE.time() < ta + dt) __CINE.step(1/30, true); }, [a.tArrive, dt]); await snap(n); }
 // 2) plans de découverte forcés et dérive planétaire
 await p.evaluate(()=>{ const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 3) __CINE.step(.25, true); });
 for(const k of ['planetrise', 'terminator', 'planet']){
   const r = await p.evaluate((k)=>{ const ty = __CINE.forceVista(k, 18); for(let i = 0; i < 60; i++) __CINE.step(1/30, true); return ty; }, k); console.log('vista', k, '->', r); await snap(k + '_a');
   await p.evaluate(()=>{ for(let i = 0; i < 10; i++) __CINE.step(.8, true); }); await snap(k + '_b'); }
 const pd = await p.evaluate(()=>{ __CINE.forceShot('planetDrift'); for(let i = 0; i < 40; i++) __CINE.step(1/30, true); return __CINE.caption && __CINE.caption().type; }); await snap('planetDrift');
 console.log('planetDrift', pd);
 // 3) statistiques : plans distincts, systèmes, éclipses, durées des travellings
 const st = await p.evaluate((mins)=>{ const out = { visits: 0, ecl: 0, eclSys: [], shots: {}, dur: {}, n: 0 }; let last = null, t0 = __CINE.time(), leg = null, eclInLeg = false, prevEcl = false, consec = 0;
   const end = t0 + mins*60; while(__CINE.time() < end){ const o = __CINE.step(.1, true); const cap = o.cap || {}; const L = cap.star || '';
     if(L !== leg){ if(leg !== null){ out.visits++; if(eclInLeg && prevEcl) consec++; prevEcl = eclInLeg; } leg = L; eclInLeg = false; }
     if(o.shot !== last){ if(last){ const d = __CINE.time() - t0; (out.dur[last] = out.dur[last] || []).push(+d.toFixed(1)); } last = o.shot; t0 = __CINE.time(); out.shots[o.shot] = (out.shots[o.shot] || 0) + 1; out.n++; if(o.shot === 'vista_eclipse'){ out.ecl++; eclInLeg = true; } } }
   const avg = a => a && a.length ? +(a.reduce((x, y) => x + y, 0)/a.length).toFixed(1) : null;
   return { visits: out.visits, eclipses: out.ecl, consecutive: consec, n: out.n, shots: out.shots, avgDur: Object.fromEntries(Object.entries(out.dur).map(([k, v]) => [k, avg(v)])) }; }, mins);
 console.log('stats', JSON.stringify(st));
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
