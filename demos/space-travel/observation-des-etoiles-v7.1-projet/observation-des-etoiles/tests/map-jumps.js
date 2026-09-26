// API carte : prochain saut en distorsion, saut en attente, nébuleuse, lune, ceinture ; plusieurs graines
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-5') + '&ftl=warp');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const r = await p.evaluate(()=>{
   const C = __CINE, out = { log: [] };
   const stepTo = f => { let n = 0; while(!f() && n++ < 6000) C.step(0.1, true); return n; };
   const pickStar = (avoid) => { const ms = C.mapState(), c = ms.cur.cell.split(',').map(Number); for(let r = 2; r < 6; r++) for(let i=-r;i<=r;i++) for(let k=-r;k<=r;k++){ const sd = starDataForCell(c[0]+i, c[1], c[2]+k); if(sd && !avoid.includes(sd.cell)) return sd; } };
   // 1) visite en distorsion : on change la cible pendant l'orbite
   stepTo(() => C.visit().mode === 'warp' && C.time() > C.visit().tO0 + 1 && C.time() < C.visit().depStart - 6);
   let v = C.visit(); out.mode1 = v.mode + ' ftl ' + v.departer.model;
   if(v.mode === 'warp'){
     const ms = C.mapState(), sd = pickStar([ms.cur.cell, ms.next.cell]);
     const w0 = { tEng: v.warp.tEng, tExit: v.warp.tExit, Dphys: v.warp.Dphys, Vc: Math.round(v.warp.Vc) };
     out.set1 = C.setNextStar(sd.cell, 1);
     v = C.visit(); out.warpKept = { tEng: v.warp.tEng === w0.tEng, tExit: v.warp.tExit === w0.tExit, Dphys: Math.abs(v.warp.Dphys - w0.Dphys) < 1e-6, Vc0: w0.Vc, Vc1: Math.round(v.warp.Vc), arrB: v.arrB.target.properName, want: C.systemInfo(sd.cell).planets[1] ? C.systemInfo(sd.cell).planets[1].name : '-' };
     const target = sd.name, cell0 = ms.cur.cell;
     // galPos pendant la distorsion va vers la nouvelle étoile
     stepTo(() => C.time() > C.visit().warp.tCru + 1); const g1 = C.mapState(); out.warpProg = +g1.progress.toFixed(3);
     stepTo(() => C.visit().leg.cell !== cell0);
     out.arrived1 = C.visit().leg.name + ' (want ' + target + ') target ' + C.visit().target.properName;
   }
   // 2) saut choisi trop tard : en attente, appliqué au système suivant
   stepTo(() => C.time() > C.visit().depStart + 1 && C.time() < C.visit().tJ);
   { const ms = C.mapState(), sd = pickStar([ms.cur.cell, ms.next.cell]); out.set2 = C.setNextStar(sd.cell); out.pending = C.mapState().pending && C.mapState().pending.name; const nextName = ms.next.name, cell0 = ms.cur.cell;
     stepTo(() => C.visit().leg.cell !== cell0); out.arrived2 = C.visit().leg.name + ' (want ' + nextName + ') then next ' + C.mapState().next.name + ' (want ' + sd.name + ')' + ' pend ' + JSON.stringify(C.mapState().pending); }
   // 3) nébuleuse, lune, ceinture, étoile : pendant l'orbite
   stepTo(() => C.time() > C.visit().tO0 + 1 && C.time() < C.visit().depStart - 14);
   const ms = C.mapState(), si = C.systemInfo(ms.cur.cell);
   const loaded = []; for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++){ const gp = ms.gal, k = [Math.round(gp[0]/1600)+x, Math.round(gp[1]/1600)+y, Math.round(gp[2]/1600)+z].join(','); if(C.nebulaLoaded(k)) loaded.push(k); }
   out.nebLoaded = loaded.length;
   if(loaded.length){ out.fNeb = C.focus({ kind:'nebula', key: loaded[0], gal: [0,0,0] }) + ' / ' + C.caption().place; for(let i=0;i<5;i++) C.step(0.1, true); }
   out.fNebFar = C.focus({ kind:'nebula', key: '99,99,99', gal: [ms.gal[0] + 3000, ms.gal[1], ms.gal[2] + 3000] });
   const withMoon = si.planets.find(p => C.moonsInfo(p.i).length);
   if(withMoon){ out.fMoon = C.focus({ kind:'moon', cell: ms.cur.cell, i: withMoon.i, k: 0 }) + ' / ' + C.caption().place; for(let i=0;i<5;i++) C.step(0.1, true); }
   if(si.belt){ out.fBelt = C.focus({ kind:'belt', cell: ms.cur.cell }) + ' / ' + C.caption().place; for(let i=0;i<5;i++) C.step(0.1, true); }
   out.fStar = C.focus({ kind:'star', cell: ms.cur.cell }) + ' / ' + C.caption().place;
   out.fSame = C.focus({ kind:'planet', cell: ms.next.cell, i: 0 });
   // 4) 12 minutes simulées ensuite : pas d'erreur, systèmes libérés
   for(let i=0;i<7200;i++) C.step(0.1, true);
   out.dbg = C.debug(); out.route = C.mapState().route.length;
   return out;
 });
 console.log(JSON.stringify(Object.assign(r, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
