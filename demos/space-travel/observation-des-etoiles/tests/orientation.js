// mesure l'orientation (nez) par rapport à la vitesse pour le héros et le trafic, par phase
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const seed of process.argv.slice(2)){
 const p=await b.newPage({viewport:{width:320,height:180}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 const r = await p.evaluate(()=>{
   const V = THREE.Vector3, out = [];
   __CINE.step(0.05, true);
   const vis = __CINE.visit(), h = .05;
   const fwdOf = st => st.q ? new V(0,0,-1).applyQuaternion(st.q) : st.nose.clone().normalize();
   const probe = (sh, label, t0, t1) => { const rows = []; for(let t = t0; t < t1; t += .5){ const a = sh.traj(t - h), c = sh.traj(t + h), s = sh.traj(t);
       const vel = c.pos.clone().sub(a.pos); const sp = vel.length()/(2*h); if(sp < 1e-6) continue; const d = fwdOf(s).dot(vel.normalize());
       const pl = vis.target, alt = pl ? (s.pos.distanceTo(pl.position)/pl.radius) : 0;
       rows.push([+t.toFixed(1), +d.toFixed(2), Math.round(sp), +alt.toFixed(2), (s.throttle||0).toFixed(1)]); }
     return { label, rows }; };
   out.push(probe(vis.hero, 'hero', vis.tArrive, vis.depStart + 12));
   (vis.leg.npcs || []).forEach(s => { if(s.traj) out.push(probe(s, s.model, vis.tArrive, vis.tArrive + 60)); });
   return { tArrive: vis.tArrive, tT0: vis.tT0, tO0: vis.tO0, depStart: vis.depStart, out };
 });
 console.log('==', seed, 'tArrive', r.tArrive.toFixed(1), 'tT0', r.tT0.toFixed(1), 'tO0', r.tO0.toFixed(1), 'depStart', r.depStart.toFixed(1));
 r.out.forEach(o => { const neg = o.rows.filter(x => x[1] < -.3); console.log(o.label, 'samples', o.rows.length, 'backward', neg.length, neg.length ? JSON.stringify(neg.map(x => [x[0], x[1], x[3]])) : ''); });
 await p.close(); }
 await b.close();
})();
