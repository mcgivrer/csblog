// carte et radar sur mobile (390×844, tactile) puis en paysage ; version minifiée ; double-tap ; mouvement réduit
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2, reducedMotion: 'reduce'});
 const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.min.html?seed=' + (process.argv[2] || 'OBS-2') + '&quality=low');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.tap('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ for(let i=0;i<280;i++) __CINE.step(0.1, true); });
 await p.waitForTimeout(1500);
 await p.screenshot({path:'mob_radar.jpg', type:'jpeg', quality:80, timeout:120000});
 await p.evaluate(()=>__STARMAP.open()); await p.waitForTimeout(3000);
 await p.screenshot({path:'mob_sector.jpg', type:'jpeg', quality:80, timeout:120000});
 const box = await p.evaluate(()=>{ const r = document.querySelector('#stmMap canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
 const out = { box };
 // double-tap sur l'étoile courante → la caméra y va (travelling de l'étoile)
 const hits = await p.evaluate(()=>__STARMAP._hits()); const ms = await p.evaluate(()=>__CINE.mapState());
 const cur = hits.find(h => h.kind === 'star' && h.key.indexOf(ms.cur.cell) >= 0);
 out.cur = cur && cur.name;
 await p.touchscreen.tap(box.x + cur.x, box.y + cur.y); await p.waitForTimeout(200);
 out.panel = await p.evaluate(()=>document.querySelector('#stmMap .info').innerText.replace(/\n/g,' | ').slice(0, 160));
 await p.screenshot({path:'mob_sel.jpg', type:'jpeg', quality:80, timeout:120000});
 await p.click('#stmMap .acts [data-a=sys]'); await p.waitForTimeout(600);
 await p.screenshot({path:'mob_system.jpg', type:'jpeg', quality:80, timeout:120000});
 out.level = await p.evaluate(()=>__STARMAP.debug().level);
 const h2 = await p.evaluate(()=>__STARMAP._hits()); const st = h2.find(h => h.kind === 'star');
 await p.touchscreen.tap(box.x + st.x, box.y + st.y); await p.waitForTimeout(120); await p.touchscreen.tap(box.x + st.x, box.y + st.y); await p.waitForTimeout(500);
 await p.evaluate(()=>{ __CINE.step(0.05, true); });
 out.dbl = await p.evaluate(()=>({ open: __STARMAP.isOpen(), toast: document.getElementById('sttToast').textContent, shot: __CINE.caption().place, vista: __CINE.caption().vista }));
 // paysage
 await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
 await p.evaluate(()=>__STARMAP.open()); await p.waitForTimeout(1500);
 await p.screenshot({path:'mob_land.jpg', type:'jpeg', quality:80, timeout:120000});
 out.land = await p.evaluate(()=>__STARMAP.debug());
 console.log(JSON.stringify(Object.assign(out, { errs: errs.slice(0,6) }), null, 1));
 await b.close();
})();
