// intérieurs (v7.3) : gros plans à travers un hublot, une passerelle, une baie panoramique et un hangar — node t61.js modèle âge [préfixe] [ambiance]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const model = process.argv[2] || 'l20', age = +(process.argv[3] || .2), pre = process.argv[4] || 'int', style = process.argv[5];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) console.log('C', m.text().slice(0,900)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=OBS-1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const info = await p.evaluate(([model, age, style])=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit,#stmRadar').forEach(e=>e.style.display='none');
   renderer.setPixelRatio(1); renderer.setSize(960, 540);
   const o = { warp: true, jump: true, age, ageSeed: 77 }; if(style !== undefined && style !== '') o.interior = +style;
   const bb = SHIPGEN.build(model, o); bb.lights.forEach(l => l.parent && l.parent.remove(l));
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a); sc.add(new THREE.AmbientLight(0x141c2e, .55));
   const L = new THREE.DirectionalLight(0xfff2e0, .25); L.position.set(.7, .6, -.3); sc.add(L); sc.add(L.target); sc.add(bb.group);
   const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunCol.value.setRGB(1, .96, .9); G.uSunI.value = .15; G.uTime.value = 30;
   const list = [];
   const scan = (mesh) => { if(!mesh) return; const g = mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, T = g.attributes.aT.array, WP = g.attributes.aWinP.array, WA = g.attributes.aWinA.array;
     for(let i = 0; i < P.length/12; i++){ const c = [0, 1, 2].map(k => (P[i*12 + k] + P[i*12 + 3 + k] + P[i*12 + 6 + k] + P[i*12 + 9 + k])/4);
       list.push({ c, n: [N[i*12], N[i*12 + 1], N[i*12 + 2]], t: [T[i*12], T[i*12 + 1], T[i*12 + 2]], type: WP[i*16 + 2], hx: WA[i*16], hy: WA[i*16 + 1] }); } };
   scan(bb.glass && bb.glass.mesh); scan(bb.glass && bb.glass.bays && bb.glass.bays.draw);
   const pick = ty => list.filter(w => Math.round(w.type) === ty).sort((a, b) => b.hx - a.hx)[0] || null;
   window.__v = { sc, cam: new THREE.PerspectiveCamera(50, 16/9, .02, 1e4), picks: [0, 1, 2, 3, 4].map(pick) };
   return { style: bb.glass && bb.glass.style, types: [0, 1, 2, 3, 4].map(t => list.filter(w => Math.round(w.type) === t).length) };
 }, [model, age, style]);
 console.log(JSON.stringify(info));
 if(process.env.DIST) await p.evaluate(([d, l])=>{ window.__DIST = d; window.__LAT = l; }, [process.env.DIST, process.env.LAT || '.35']);
 const names = ['cabin', 'bridge', 'pano', 'hangar', 'belly'];
 for(let k = 0; k < 5; k++){
   const ok = await p.evaluate((k)=>{ const { sc, cam, picks } = window.__v, w = picks[k]; if(!w) return false;
     const c = new THREE.Vector3(...w.c), n = new THREE.Vector3(...w.n), tt = new THREE.Vector3(...w.t), up = new THREE.Vector3().crossVectors(n, tt).normalize();
     const dist = Math.max(w.hx, w.hy)*(k === 0 ? 1.5 : (k === 1 ? 1.1 : 1.3)) + (k === 0 ? .35 : .6);
     const lat = +(window.__LAT || .35); if(window.__DIST) { cam.position.set(0,0,0); }
     const dd = window.__DIST ? +window.__DIST : dist; cam.position.copy(c).addScaledVector(n, dd).addScaledVector(tt, dd*lat).addScaledVector(up, dd*.12); cam.up.copy(k === 4 ? tt : up); cam.lookAt(c.clone().addScaledVector(n, -1.2));
     cam.fov = 50; cam.aspect = 16/9; cam.updateProjectionMatrix(); renderer.autoClear = true; renderer.setRenderTarget(null); renderer.render(sc, cam); return true; }, k);
   if(ok) await p.screenshot({ path: `${pre}_${names[k]}.jpg`, type: 'jpeg', quality: 86 });
 }
 await b.close();
})();
