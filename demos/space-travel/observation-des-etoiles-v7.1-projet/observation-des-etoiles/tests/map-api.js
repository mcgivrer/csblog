// API carte et radar (lot 2) : état, systèmes, vaisseaux, radar, changement du prochain saut, envoi de la caméra
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const r = await p.evaluate(()=>{
   const C = __CINE, out = {};
   for(let i=0;i<150;i++) C.step(0.1, true);
   const ms = C.mapState(); out.ms = { cur: ms.cur.name, next: ms.next.name, phase: ms.phase, can: ms.canRetarget, route: ms.route.length, hero: ms.hero };
   let t0 = performance.now(); const si = C.systemInfo(ms.cur.cell); out.siMs = +(performance.now() - t0).toFixed(2);
   out.si = { name: si.name, n: si.planets.length, pl: si.planets.map(p => p.name + ':' + p.kind + ':' + (p.a/C.AU).toFixed(2) + 'AU:' + p.ang.toFixed(2)), belt: !!si.belt, hz: si.hz.map(x => (x/C.AU).toFixed(2)) };
   // cohérence de la base : les planètes sont dans le plan (s, l)
   const v = C.visit(); const B = si.basis; out.planar = v.leg.planets.map(p => { const x = p.position; const s = B.s, l = B.l; const n = [s[1]*l[2]-s[2]*l[1], s[2]*l[0]-s[0]*l[2], s[0]*l[1]-s[1]*l[0]]; return +((x.x*n[0]+x.y*n[1]+x.z*n[2])/x.length()).toFixed(4); });
   t0 = performance.now(); const far = C.systemInfo((() => { const c = ms.cur.cell.split(',').map(Number); for(let i=2;i<9;i++){ const sd = starDataForCell(c[0]+i, c[1], c[2]); if(sd) return sd.cell; } })()); out.farMs = +(performance.now() - t0).toFixed(2); out.far = far && far.name + ':' + far.planets.length;
   const sh = C.shipsInfo(); out.ships = sh.map(s => s.reg + ' ' + s.name + ' ' + s.model + (s.hero ? '*' : '') + (s.subj ? '@' : ''));
   t0 = performance.now(); let rs; for(let i=0;i<100;i++) rs = C.radarState(); out.radarMs = +((performance.now() - t0)/100).toFixed(3);
   out.radar = rs && { subj: rs.name + ' ' + rs.reg, n: rs.contacts.length, near: rs.contacts.slice(0,5).map(c => c.reg + ' ' + C.fmtU(c.d) + (c.craft ? ' (craft)' : '')) };
   out.fmt = [0.4, 12, 999, 1000, 45210, 999600, 3.2e6, 7.7e9, 1.5e12].map(C.fmtU);
   // focus : planète, étoile, vaisseau
   out.fPlanet = C.focus({ kind:'planet', cell: ms.cur.cell, i: si.planets.length - 1 }) + ' ' + C.caption().place;
   for(let i=0;i<5;i++) C.step(0.1, true);
   out.fStar = C.focus({ kind:'star', cell: ms.cur.cell }) + ' ' + C.caption().place;
   const other = sh.find(s => !s.hero); out.fShip = other ? C.focus({ kind:'ship', uid: other.uid }) + ' ' + C.caption().name + '=' + other.name : 'no ship';
   // changement du prochain saut
   const c = ms.cur.cell.split(',').map(Number); let tgt = null; for(let i=-4;i<=4 && !tgt;i++) for(let k=-4;k<=4 && !tgt;k++){ const sd = starDataForCell(c[0]+i, c[1], c[2]+k); if(sd && sd.cell !== ms.cur.cell && sd.cell !== ms.next.cell && Math.abs(i)+Math.abs(k) > 2) tgt = sd; }
   const tm0 = C.timings();
   out.set = C.setNextStar(tgt.cell, 0); out.newNext = C.mapState().next.name + ' vs ' + tgt.name;
   const tm1 = C.timings(); out.timesKept = ['depStart','tJ','tEnd','tExit'].every(k => tm0[k] === tm1[k]);
   out.mode = tm1.mode + ' warpC ' + tm1.warpC;
   // avance jusqu'à l'arrivée
   const T0 = C.time(); let n = 0; while(C.visit().leg.cell === ms.cur.cell && n++ < 2000) C.step(0.1, true);
   out.arrived = C.visit().leg.name + ' target ' + C.visit().target.properName + ' idx0 ' + C.visit().leg.planets[0].properName;
   out.route = C.mapState().route.map(r => r.name);
   out.dbg = C.debug();
   return out;
 });
 console.log(JSON.stringify(Object.assign(r, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
