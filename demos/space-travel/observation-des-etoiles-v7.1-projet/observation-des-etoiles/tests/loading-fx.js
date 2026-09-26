// lot 3 : profondeur de champ (captures avec / sans, coût), cardans des tuyères, tremblement ; lot 5 : barre de chargement
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported sources/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 const prog = [];
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3'));
 const t0 = Date.now();
 for(let i=0;i<400;i++){ const r = await p.evaluate(()=>({ p: window.__loadProgress ? __loadProgress().p : -1, l: (document.getElementById('sttPl')||{}).textContent, ready: !!document.querySelector('#sttStart.ready') })); if(!prog.length || prog[prog.length-1].l !== r.l) prog.push(Object.assign({ t: Date.now() - t0 }, r)); if(r.ready) break; await p.waitForTimeout(150); }
 await p.screenshot({path:'lp_ready.jpg', type:'jpeg', quality:85, timeout:120000});
 const marks = await p.evaluate(()=>__loadProgress().marks);
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const out = await p.evaluate(()=>{
   const C = __CINE, o = {};
   for(let i=0;i<220;i++) C.step(0.1, true);
   // cardans : ensembles moteur et jets associés
   const v = C.visit(); const units = [];
   [v.hero, v.departer].forEach(s => { if(s.drive && s.drive.units) units.push(s.model + ':' + s.drive.units.length + ' units, ' + s.drive.units.filter(u => u.plume).length + ' plumes'); });
   o.units = units;
   return o;
 });
 // gros plan : avec et sans profondeur de champ (même image)
 const shots = ['engineClose', 'hullDolly', 'bowClose'];
 out.dof = [];
 for(const s of shots){
   const info = await p.evaluate((s)=>{ const C = __CINE; C.forceShot(s); C.step(0.02, true); for(let i=0;i<8;i++) C.step(0.05, true); const d = C.dof(); return { type: C.caption().type, dof: d }; }, s);
   await p.evaluate(()=>__CINE.step(0.0001, false)); await p.screenshot({path:'dof_on_' + s + '.jpg', type:'jpeg', quality:90, timeout:120000});
   // coût : 5 rendus avec, 5 sans
   const cost = await p.evaluate(()=>{ const C = __CINE; const gl = renderer.getContext(); const t = n => { gl.finish(); const a = performance.now(); for(let i=0;i<n;i++) C.step(0, false); gl.finish(); return (performance.now() - a)/n; }; const on = t(3); return { on: +on.toFixed(1) }; });
   info.cost = cost; out.dof.push(info);
 }
 // tremblement : pendant la charge de la géode et le saut
 out.shake = await p.evaluate(()=>{ const C = __CINE, v = C.visit(); let n = 0; while(C.time() < v.tJ - 1 && n++ < 3000) C.step(0.1, true);
   const r = []; C.forceShot('geodeClose'); for(let i=0;i<60;i++){ C.step(0.1, true); r.push(C.dof().shake); } return { max: Math.max(...r), mean: +(r.reduce((a,b)=>a+b,0)/r.length).toFixed(3), seq: r.filter((x,i)=>i%6===0) }; });
 console.log(JSON.stringify(Object.assign(out, { prog, marks, errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
