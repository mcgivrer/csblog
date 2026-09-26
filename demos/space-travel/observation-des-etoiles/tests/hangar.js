// hangar : vues libres d'un modèle — node t31.js model age "fx,fy,fz,lz,fov;..." out [dark]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const model = process.argv[2] || 'x1', age = +(process.argv[3] || 0), views = (process.argv[4] || '1.2,.2,.5,.5,40').split(';').map(s => s.split(',').map(Number)), out = process.argv[5] || 'win', dark = process.argv[6] === 'dark';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) console.log('C', m.text().slice(0,1500)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=OBS-1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 await p.evaluate((t)=>{ window.__THR = t; }, +(process.env.THR||0)); if(process.argv[7] === 'abs') await p.evaluate(()=>{ window.__ABS = true; });
 const info = await p.evaluate(([model, age, dark])=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit').forEach(e=>e.style.display='none');
   const bb = model.startsWith('craft:') ? (() => { const [_, k, v] = model.split(':'); const c = __CRAFT.build(k, { variant: v, age, seed: 77 }); c.thr.value = window.__THR || 0; c.nav.forEach(n => n.mat.opacity = n.peak); c.lamps.forEach(l => l.value = 1); return { group: c.group, lights: [], glass: { count: 0 }, docks: [], craft: c }; })()
     : SHIPGEN.build(model, { warp: true, jump: true, age, ageSeed: 77 }); bb.lights.forEach(l => l.parent && l.parent.remove(l));
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a);
   sc.add(new THREE.AmbientLight(0x141c2e, .55)); const L = new THREE.DirectionalLight(0xfff2e0, dark ? .08 : 1.65); L.position.set(.7, .6, -.3); sc.add(L); sc.add(L.target);
   sc.add(bb.group);
   if(window.__SHIPGLASS){ const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunCol.value.setRGB(1, .96, .9); G.uSunI.value = dark ? .05 : 1; G.uTime.value = 12; }
   const box = new THREE.Box3().setFromObject(bb.group);
   const R = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
   window.__dv = { bb, sc, box, R, cam: new THREE.PerspectiveCamera(40, 16/9, .05, 1e5), sz: renderer.getDrawingBufferSize(new THREE.Vector2()) };
   return { glass: bb.glass ? bb.glass.count : 0, docks: (bb.docks||[]).length, R: +R.toFixed(1), z: [+box.min.z.toFixed(1), +box.max.z.toFixed(1)], x: +box.max.x.toFixed(1), y: [+box.min.y.toFixed(1), +box.max.y.toFixed(1)] };
 }, [model, age, dark]);
 for(let i=0;i<views.length;i++){
   await p.evaluate((v)=>{ const { bb, sc, box, R, cam, sz } = window.__dv; const [fx, fy, fz, lz, fov, lx, ly] = v; SHIPGEN.tick(3.7, 0, 1);
     if(window.__ABS){ renderer.autoClear = true; renderer.setRenderTarget(null); cam.fov = v[6] || 40; cam.aspect = sz.x/sz.y; cam.updateProjectionMatrix(); cam.position.set(v[0], v[1], v[2]); cam.lookAt(v[3], v[4], v[5]); renderer.render(sc, cam); return; }
     const Z = f => box.min.z + (box.max.z - box.min.z)*f;
     renderer.autoClear = true; renderer.setRenderTarget(null); cam.fov = fov || 40; cam.aspect = sz.x/sz.y; cam.updateProjectionMatrix(); cam.position.set(fx*R, fy*R, Z(fz)); cam.lookAt((lx||0)*R, (ly||0)*R, Z(lz)); renderer.render(sc, cam); }, views[i]);
   await p.screenshot({path:`${out}_${model.replace(/:/g,'-')}_${i}.jpg`,type:'jpeg',quality:88});
 }
 console.log(JSON.stringify(info));
 await b.close();
})();
