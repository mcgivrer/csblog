// double-tap tactile (événements synthétiques), 200 ouvertures/fermetures, zooms extrêmes, changements de cible répétés : mémoire et coûts
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-precise-memory-info','--js-flags=--expose-gc']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-7'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const r = await p.evaluate(async ()=>{
   const C = __CINE, M = __STARMAP, out = {};
   for(let i=0;i<200;i++) C.step(0.1, true);
   const cv = document.querySelector('#stmMap canvas');
   const ev = (type, x, y, id) => { const rc = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id || 7, pointerType: 'touch', isPrimary: true, clientX: rc.left + x, clientY: rc.top + y, button: 0 })); };
   const frame = n => { for(let i=0;i<(n||1);i++) M.frame(performance.now() + i*400); };
   M.open(); frame(3);
   // double-tap sur l'étoile courante (secteur) → travelling de l'étoile
   let h = M._hits().find(h => h.kind === 'star' && h.key.indexOf(C.mapState().cur.cell) >= 0);
   ev('pointerdown', h.x, h.y); ev('pointerup', h.x, h.y); ev('pointerdown', h.x + 3, h.y + 2); ev('pointerup', h.x + 3, h.y + 2);
   C.step(0.05, true); out.dbl = { open: M.isOpen(), cap: C.caption().vista ? 'vista ' + C.caption().place : C.caption().type };
   // pincement : deux doigts qui s'écartent → zoom
   M.open(); frame(2); const k0 = M.debug().v.k;
   ev('pointerdown', 500, 300, 1); ev('pointerdown', 540, 300, 2); ev('pointermove', 480, 300, 1); ev('pointermove', 560, 300, 2); ev('pointermove', 460, 300, 1); ev('pointermove', 580, 300, 2); ev('pointerup', 460, 300, 1); ev('pointerup', 580, 300, 2);
   out.pinch = +(M.debug().v.k/k0).toFixed(2);
   // zooms extrêmes : molette jusqu'au bout dans les deux sens
   const wheel = (dy, x, y) => { const rc = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy, clientX: rc.left + x, clientY: rc.top + y })); };
   const t0 = performance.now(); let lv = []; for(let i=0;i<60;i++){ wheel(400, 300, 200); frame(); if(i % 20 === 19) await new Promise(r => setTimeout(r, 520)); } lv.push(M.debug().level + ':' + (M.debug().v.k).toFixed(3));
   for(let i=0;i<80;i++){ wheel(-400, 438, 276); frame(); if(i % 10 === 9){ await new Promise(r => setTimeout(r, 520)); lv.push(M.debug().level); } }
   out.zoom = { levels: lv.join(' '), ms: Math.round(performance.now() - t0) };
   // 200 ouvertures / fermetures avec dessin
   if(window.gc) gc(); const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
   const t1 = performance.now(); for(let i=0;i<200;i++){ M.open(); frame(2); M.close(); if(i % 50 === 0) C.step(0.1, true); }
   out.cycles = { ms: Math.round(performance.now() - t1), perOpenMs: +((performance.now() - t1)/200).toFixed(2) };
   // coût d'un dessin de secteur au zoom minimal (la plupart des étoiles)
   M.open(); M._set({ level: 'sector', cell: null, v: { x: C.mapState().cur.gal[0], y: C.mapState().cur.gal[2], k: 1280/6000 } }); for(let i=0;i<40;i++){ frame(); } let t2 = performance.now(); for(let i=0;i<10;i++) M._draw(); out.drawWideMs = +((performance.now() - t2)/10).toFixed(2);
   M._set({ v: { x: C.mapState().cur.gal[0], y: C.mapState().cur.gal[2], k: 1280/300 } }); for(let i=0;i<10;i++) frame(); t2 = performance.now(); for(let i=0;i<10;i++) M._draw(); out.drawCloseMs = +((performance.now() - t2)/10).toFixed(2);
   out.dbgMap = M.debug(); M.close();
   // changements de prochain saut répétés sur 6 visites
   const sys0 = C.debug().sys; let sets = [];
   for(let v=0; v<6; v++){
     const cell0 = C.visit().leg.cell; let n = 0; while(!(C.time() > C.visit().tO0 + 1 && C.time() < C.visit().depStart - 8) && n++ < 3000) C.step(0.1, true);
     for(let j=0;j<3;j++){ const ms = C.mapState(), c = ms.cur.cell.split(',').map(Number); let sd = null; for(let t=0;t<30 && !sd;t++){ const s2 = starDataForCell(c[0] + ((t*7)%9) - 4, c[1], c[2] + ((t*5)%9) - 4); if(s2 && s2.cell !== ms.cur.cell && s2.cell !== ms.next.cell) sd = s2; }
       sets.push(C.setNextStar(sd.cell)); for(let i=0;i<20;i++) C.step(0.1, true); }
     n = 0; while(C.visit().leg.cell === cell0 && n++ < 4000) C.step(0.1, true);
   }
   for(let i=0;i<300;i++) C.step(0.1, true);
   if(window.gc) gc(); const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
   out.retarget = { sets: sets.join(','), sys0, sys1: C.debug().sys, ships: C.debug().ships, heapMB: [+(heap0/1048576).toFixed(1), +(heap1/1048576).toFixed(1)] };
   __RADAR._reset(); for(let i=0;i<50;i++){ __RADAR.frame(performance.now() + i*110, true); } out.radar = __RADAR.stats();
   return out;
 });
 console.log(JSON.stringify(Object.assign(r, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
