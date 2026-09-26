// profondeur de champ : même image avec et sans (résolution fixe), coût du rendu ; cardans ; capture directe du canevas
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
const fs = require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported sources/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3') + '&dof=1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.keyboard.press(' ');
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; renderer.setPixelRatio(1); renderer.setSize(960, 540); for(let i=0;i<240;i++) __CINE.step(0.1, true); });
 const out = { shots: [] };
 const shots = (process.argv[3] || 'engineClose,hullDolly,bowClose').split(',');
 for(const s of shots){
   const r = await p.evaluate((s)=>{ const C = __CINE; C.setDof(true); if(s === 'bayOps') C.forceBay(0, null, .2); else C.forceShot(s); C.step(0.02, true); for(let i=0;i<12;i++) C.step(0.05, true);
     const gl = renderer.getContext(), cv = renderer.domElement;
     const shotA = () => { gl.finish(); const a = performance.now(); C.step(0, false); gl.finish(); const t = performance.now() - a; return { t, url: cv.toDataURL('image/png') }; };
     const on = shotA(), on2 = shotA(); const d = C.dof(); C.setDof(false); C.step(0, true); const off = shotA(), off2 = shotA(); C.setDof(true);
     return { type: C.caption().type + ' / ' + s, dof: d, msOn: +Math.min(on.t, on2.t).toFixed(0), msOff: +Math.min(off.t, off2.t).toFixed(0), a: on2.url, b: off2.url }; }, s);
   fs.writeFileSync('dofA_' + s + '.png', Buffer.from(r.a.split(',')[1], 'base64')); fs.writeFileSync('dofB_' + s + '.png', Buffer.from(r.b.split(',')[1], 'base64'));
   delete r.a; delete r.b; out.shots.push(r);
 }
 out.gimbal = await p.evaluate(()=>{ const v = __CINE.visit(), s = v.departer; return s.drive && s.drive.units ? s.drive.units.map(u => [u.G.rotation.x.toFixed(4), u.G.rotation.y.toFixed(4)].join('/')).join(' ') : 'none'; });
 console.log(JSON.stringify(Object.assign(out, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
