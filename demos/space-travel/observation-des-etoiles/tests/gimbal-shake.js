// cardans pendant un retournement (gros plan des tuyères) et tremblement à l'allumage du départ
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3') + '&dof=1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 const r = await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; renderer.setPixelRatio(1); renderer.setSize(960, 540);
   const C = __CINE, out = {};
   // 1) retournement du transfert suivant
   let n = 0; while(C.time() < C.visit().tO0 + 1 && n++ < 3000) C.step(0.1, true);          // on quitte le premier transfert
   const cell0 = C.visit().leg.cell; n = 0; while(C.visit().leg.cell === cell0 && n++ < 4000) C.step(0.1, true);
   const fw = C.flipWindow(); n = 0; while(C.time() < (fw[0] + fw[1])/2 - 1.2 && n++ < 3000) C.step(0.05, true);
   C.forceShot('engineClose'); const g = []; for(let i=0;i<24;i++){ C.step(0.05, true); const s = C.visit().hero; if(s.drive && s.drive.units) g.push(s.drive.units[0].G.rotation.x.toFixed(3) + '/' + s.drive.units[0].G.rotation.y.toFixed(3)); }
   out.flip = { hero: C.visit().hero.model, T: C.time().toFixed(1), fw: fw.map(x => x.toFixed(1)), gimbal: g.filter((x,i)=>i%3===0), shot: C.caption().type };
   C.step(0, false); out.img1 = renderer.domElement.toDataURL('image/jpeg', .9);
   // 2) allumage du départ en gros plan : tremblement
   n = 0; while(C.time() < C.visit().depStart - 1.5 && n++ < 4000) C.step(0.1, true);
   C.forceShot('engineClose'); const sk = []; for(let i=0;i<40;i++){ C.step(0.05, true); sk.push(C.dof().shake); }
   out.ignition = { max: Math.max(...sk).toFixed(3), seq: sk.filter((x,i)=>i%4===0).map(x=>x.toFixed(2)) };
   C.step(0, false); out.img2 = renderer.domElement.toDataURL('image/jpeg', .9);
   return out; });
 fs.writeFileSync('gimbal_flip.jpg', Buffer.from(r.img1.split(',')[1], 'base64')); fs.writeFileSync('ignition.jpg', Buffer.from(r.img2.split(',')[1], 'base64')); delete r.img1; delete r.img2;
 console.log(JSON.stringify(Object.assign(r, { errs }), null, 1));
 await b.close();
})();
