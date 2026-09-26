// textures HD : avant / après sur les mêmes vues rapprochées (coque, conteneurs, bandes de danger, petit engin)
// node t56.js [hitex=0|1] prefix
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const { chromium } = require('playwright');
(async()=>{
 const hi = process.argv[2] !== '0', pre = process.argv[3] || (hi ? 'hd' : 'sd');
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) console.log('C', m.text().slice(0,400)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.argv[4] || 'dist/observation-des-etoiles.html') + '?seed=OBS-1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const info = await p.evaluate((hi)=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit,#stmRadar').forEach(e=>e.style.display='none');
   renderer.setPixelRatio(1); renderer.setSize(1280, 720);
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a); sc.add(new THREE.AmbientLight(0x141c2e, .55));
   const L = new THREE.DirectionalLight(0xfff2e0, 1.65); L.position.set(.8, .55, -.25); sc.add(L); sc.add(L.target);
   const ships = {};
   ['l20', 'e18', 'tL'].forEach((m, i) => { const bb = SHIPGEN.build(m, { warp: true, jump: true, age: .35, ageSeed: 77, hiTex: hi }); bb.lights.forEach(l => l.parent && l.parent.remove(l)); bb.group.position.x = i*400; sc.add(bb.group); ships[m] = bb; });
   const c = __CRAFT.build('maint', { age: .3, seed: 5 }); c.group.position.set(-200, 0, 0); sc.add(c.group); ships.craft = c;
   if(window.__SHIPGLASS){ const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunCol.value.setRGB(1, .96, .9); G.uSunI.value = 1; G.uTime.value = 12; }
   SHIPGEN.tick(3.7, 0, 1);
   window.__v = { sc, cam: new THREE.PerspectiveCamera(40, 16/9, .02, 1e5), ships };
   const box = new THREE.Box3().setFromObject(ships.l20.group);
   return { hitex: window.__HITEX ? __HITEX.info : null, patched: window.__HITEX ? __HITEX.patched : 0, l20: [box.min.toArray().map(x=>+x.toFixed(1)), box.max.toArray().map(x=>+x.toFixed(1))] };
 }, hi);
 console.log(JSON.stringify(info));
 const views = {
   hullNear: [[12.4, 6, 40], [9.2, 4, 46], 50],        // flanc du paquebot, 3 m
   hullGraze: [[11.2, 7.5, 20], [10.2, 6.5, 60], 40],   // vue rasante le long du flanc
   e18cont: [[400 + 26, 10, -2], [400 + 12, 2, 6], 50],  // conteneurs et cage du cargo-entrepôt
   craft: [[-200 + 4.5, 2.2, -5], [-200, 0, 0], 45],     // petit engin de maintenance, 5 m
   macro: [[11.6, 9, 52], [10.2, 8.2, 49], 45]            // macro : 1,5 m du flanc
 };
 for(const [name, [pos, look, fov]] of Object.entries(views)){
   await p.evaluate(([pos, look, fov])=>{ const { sc, cam } = window.__v; renderer.autoClear = true; renderer.setRenderTarget(null); cam.fov = fov; cam.aspect = 16/9; cam.updateProjectionMatrix(); cam.position.set(...pos); cam.lookAt(...look); renderer.render(sc, cam); }, [pos, look, fov]);
   await p.screenshot({ path: pre + '_' + name + '.jpg', type: 'jpeg', quality: 90 });
 }
 await b.close();
})();
