// porte-vaisseaux (v7.6) : vues libres du porteur, d'un vaisseau garé et de l'ombre de soute —
// node t64.js [carrier|carrierMil] [modèle garé] "x,y,z,lx,ly,lz,fov;…" [préfixe] [soleil "x,y,z"] [hold 1|0]
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const { chromium } = require('playwright');
(async()=>{
 const kind = process.argv[2] || 'carrier', parked = process.argv[3] || 'e18', views = (process.argv[4] || '-700,260,-900,0,0,-60,38').split(';').map(s => s.split(',').map(Number));
 const pre = process.argv[5] || 'cv', sun = (process.argv[6] || '.7,.6,-.3').split(',').map(Number), hold = process.argv[7] !== '0';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,600)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=OBS-1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const info = await p.evaluate(([kind, parked, sun])=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit').forEach(e=>e.style.display='none');
   const c = __CRAFT.build(kind, { age: .15, seed: 77 }); c.nav.forEach(n => n.mat.opacity = n.peak);
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a);
   sc.add(new THREE.AmbientLight(0x141c2e, .55)); const L = new THREE.DirectionalLight(0xfff2e0, 1.65); L.position.set(...sun); sc.add(L); sc.add(L.target);
   sc.add(c.group);
   let sb = null;
   if(parked !== '-'){ sb = SHIPGEN.build(parked, { age: .3, ageSeed: 5 }); sb.lights.forEach(l => l.parent && l.parent.remove(l));
     const bx = new THREE.Box3().setFromObject(sb.group), ctr = bx.getCenter(new THREE.Vector3()), B = c.extra.berths[1];
     sb.group.position.set(B.C.x - ctr.x, B.C.y - bx.min.y, B.C.z - ctr.z); sc.add(sb.group); }
   if(window.__SHIPGLASS){ const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunCol.value.setRGB(1, .96, .9); G.uSunI.value = 1; G.uTime.value = 12; }
   window.__cv = { c, sc, cam: new THREE.PerspectiveCamera(40, 16/9, .5, 2e5), sz: renderer.getDrawingBufferSize(new THREE.Vector2()) };
   const box = new THREE.Box3().setFromObject(c.group);
   return { len: c.len, name: c.name, mil: c.mil, box: [box.min.toArray().map(Math.round), box.max.toArray().map(Math.round)], rings: c.extra.rings ? c.extra.rings.list.length : 0, turrets: c.turrets.length, parked: sb ? parked : null };
 }, [kind, parked, sun]);
 console.log(JSON.stringify(info));
 for(let i = 0; i < views.length; i++){
   const calls = await p.evaluate(([v, hold])=>{ const { c, sc, cam, sz } = window.__cv; __CRAFT.TIME.value = 14.2;
     cam.fov = v[6] || 40; cam.aspect = sz.x/sz.y; cam.updateProjectionMatrix(); cam.position.set(v[0], v[1], v[2]); cam.lookAt(v[3], v[4], v[5]); cam.updateMatrixWorld();
     __CRAFT.setHold(new THREE.Vector3(), new THREE.Quaternion(), hold ? c.extra.hold : null, cam.position, cam.quaternion);
     renderer.autoClear = true; renderer.setRenderTarget(null); renderer.info.reset(); renderer.info.autoReset = false; renderer.render(sc, cam); const n = renderer.info.render.calls; renderer.info.autoReset = true; return n; }, [views[i], hold]);
   await p.screenshot({path:`${pre}_${i}.jpg`,type:'jpeg',quality:88});
   console.log('view', i, 'calls', calls);
 }
 console.log('errors', errs.length, errs.slice(0, 3));
 await b.close();
})();
