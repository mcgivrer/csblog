// livrées (v7.2) : même modèle en plusieurs palettes, au soleil puis côté nuit — node t57.js modèle "jeu,anthracite,nuit,noir" âge prefix
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const model = process.argv[2] || 'tM', pals = (process.argv[3] || 'jeu,anthracite,nuit,bouteille,bordeaux,noir').split(','), age = +(process.argv[4] || 0), pre = process.argv[5] || 'liv';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) console.log('C', m.text().slice(0,600)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=OBS-1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const info = await p.evaluate(([model, pals, age])=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit,#stmRadar').forEach(e=>e.style.display='none');
   renderer.setPixelRatio(1); renderer.setSize(1280, 720);
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a); sc.add(new THREE.AmbientLight(0x141c2e, .55));
   const L = new THREE.DirectionalLight(0xfff2e0, 1.65); sc.add(L); sc.add(L.target);
   const ships = pals.map((pl, i) => { const bb = SHIPGEN.build(model, { warp: true, jump: true, age, ageSeed: 77 + i, livery: pl }); bb.lights.forEach(l => l.parent && l.parent.remove(l)); sc.add(bb.group); return bb; });
   const box = new THREE.Box3().setFromObject(ships[0].group), W = (box.max.x - box.min.x)*1.25;
   ships.forEach((bb, i) => { bb.group.position.x = (i - (ships.length - 1)/2)*W; });
   SHIPGEN.tick(3.7, 0, 1);
   window.__v = { sc, L, ships, box, W, cam: new THREE.PerspectiveCamera(35, 16/9, .1, 1e5) };
   return { liv: ships.map(s => s.livery), flood: ships.map(s => s.wear && s.wear.uFlood.value), size: box.getSize(new THREE.Vector3()).toArray().map(x => +x.toFixed(1)) };
 }, [model, pals, age]);
 console.log(JSON.stringify(info));
 const shots = [['sun', [.8, .55, -.25], 1.65], ['night', [-.8, .3, .2], 1.65]];
 for(const [nm, dir, I] of shots){
   await p.evaluate(([dir, I])=>{ const { sc, L, ships, box, W, cam } = window.__v; L.position.set(...dir); L.intensity = I;
     if(window.__SHIPGLASS){ const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunI.value = 1; G.uTime.value = 12; }
     const n = ships.length, span = n*W, L0 = box.max.z - box.min.z;
     cam.aspect = 16/9; cam.updateProjectionMatrix(); cam.position.set(span*.08, span*.22 + 10, box.min.z - Math.max(span*.55, L0*.6)); cam.lookAt(0, 0, (box.min.z + box.max.z)/2);
     renderer.autoClear = true; renderer.setRenderTarget(null); renderer.render(sc, cam); }, [dir, I]);
   await p.screenshot({ path: `${pre}_${model}_${nm}.jpg`, type: 'jpeg', quality: 86 });
 }
 await b.close();
})();
