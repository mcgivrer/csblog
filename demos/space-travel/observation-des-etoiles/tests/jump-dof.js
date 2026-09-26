// saut quantique filmé en gros plan : profondeur de champ + lentille du saut enchaînées, erreurs GL, captures
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported sources/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3') + '&dof=1&music=0&ftl=jump');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const r = await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; renderer.setPixelRatio(1); renderer.setSize(960, 540);
   const C = __CINE, gl = renderer.getContext(), out = { frames: [] };
   let n = 0; while(C.time() < C.visit().tJ - 1.2 && n++ < 6000) C.step(0.1, true);
   const tJ = C.visit().tJ; C.forceShot('geodeClose'); let img = null;
   for(let i=0;i<50;i++){ C.step(0.1, false); const e = gl.getError(); const d = C.dof(); if(i % 5 === 0) out.frames.push([ (C.time() - tJ).toFixed(1), C.caption().type ? 'ship' : 'vista', d.k, d.shake, e ]); if(Math.abs(C.time() - tJ - 3.9) < .06) img = renderer.domElement.toDataURL('image/jpeg', .9); }
   out.img = img; out.after = C.caption(); return out; });
 if(r.img) fs.writeFileSync('jump_dof.jpg', Buffer.from(r.img.split(',')[1], 'base64')); delete r.img;
 console.log(JSON.stringify(Object.assign(r, { errs }), null, 1));
 await b.close();
})();
