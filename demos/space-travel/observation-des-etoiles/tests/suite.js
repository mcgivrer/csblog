// gros plan sur une suite (3 hublots, une seule pièce) et une cabine confort : caméra oblique proche
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=OBS-1');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const model = process.argv[2] || 'l20';
 const info = await p.evaluate((model)=>{
   document.getElementById('sttStart').style.display='none'; document.querySelectorAll('#sttTitle,#sttCap,#sttCredit,#stmRadar').forEach(e=>e.style.display='none');
   const bb = SHIPGEN.build(model, { warp: true, jump: true, age: .2, ageSeed: 77 }); bb.lights.forEach(l => l.parent && l.parent.remove(l));
   const sc = new THREE.Scene(); sc.background = new THREE.Color(0x03050a); sc.add(new THREE.AmbientLight(0x141c2e, .55));
   const L = new THREE.DirectionalLight(0xfff2e0, .15); L.position.set(.7, .6, -.3); sc.add(L); sc.add(L.target); sc.add(bb.group);
   const G = __SHIPGLASS.U; G.uSunDir.value.copy(L.position).normalize(); G.uSunCol.value.setRGB(1, .96, .9); G.uSunI.value = .1; G.uTime.value = 12;
   // hublots : centres (moyenne des 4 sommets), normale, largeur de pièce
   const g = bb.glass.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, RM = g.attributes.aRoom.array, WP = g.attributes.aWinP.array, wins = [];
   for(let i = 0; i < P.length/12; i++){ const c = [0, 1, 2].map(k => (P[i*12 + k] + P[i*12 + 3 + k] + P[i*12 + 6 + k] + P[i*12 + 9 + k])/4); wins.push({ c, n: [N[i*12], N[i*12 + 1], N[i*12 + 2]], w: RM[i*16 + 1] - RM[i*16], type: WP[i*16 + 2], seed: WP[i*16 + 3] }); }
   window.__v = { bb, sc, wins, cam: new THREE.PerspectiveCamera(40, 16/9, .02, 1e4) };
   const groups = {}; wins.filter(w => w.type === 0 && w.n[0] > .5).forEach(w => { const k = w.seed + ':' + w.c[1].toFixed(1); (groups[k] = groups[k] || []).push(w); });
   const gl = Object.values(groups), mid = ws => ws[0].c.map((_, k) => ws.reduce((a, w) => a + w.c[k], 0)/ws.length);
   const suite = gl.find(ws => ws.length === 3), comf = gl.find(ws => ws.length === 2);
   return { n: wins.length, groups: gl.map(ws => ws.length).join(''), suite: suite && mid(suite), suiteW: suite && suite[0].w, comf: comf && mid(comf), comfW: comf && comf[0].w };
 }, model);
 console.log(JSON.stringify(info));
 const shoot = async (target, off, fov, name) => { await p.evaluate(([t, o, f])=>{ const { sc, cam } = window.__v; renderer.autoClear = true; renderer.setRenderTarget(null); const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
   cam.fov = f; cam.aspect = sz.x/sz.y; cam.updateProjectionMatrix(); cam.position.set(t[0] + o[0], t[1] + o[1], t[2] + o[2]); cam.lookAt(t[0], t[1], t[2]); renderer.render(sc, cam); }, [target, off, fov]); await p.screenshot({ path: name, type: 'jpeg', quality: 90 }); };
 if(info.suite){ const m = info.suite; await shoot(m, [2.0, .3, -2.4], 62, 'suite_a.jpg'); await shoot(m, [2.6, .1, 2.2], 58, 'suite_b.jpg'); }
 if(info.comf){ const m = info.comf; await shoot(m, [2.2, .3, -2.2], 60, 'comfort_a.jpg'); }
 await b.close();
})();
