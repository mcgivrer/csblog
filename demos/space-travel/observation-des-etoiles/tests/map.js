// carte et radar : ouverture, niveaux (secteur → système → orbite), sélection, double-clic, prochain saut, radar
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ for(let i=0;i<260;i++) __CINE.step(0.1, true); });
 const out = {};
 await p.screenshot({path:'m_radar.jpg', type:'jpeg', quality:85, timeout:120000});
 out.radar = await p.evaluate(()=>__RADAR.stats());
 await p.keyboard.press('m'); await p.waitForTimeout(3500);
 out.open = await p.evaluate(()=>__STARMAP.debug());
 await p.screenshot({path:'m_sector.jpg', type:'jpeg', quality:88, timeout:120000});
 const box = await p.evaluate(()=>{ const r = document.querySelector('#stmMap canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
 // zoom vers le système courant (au centre)
 for(let i=0;i<40;i++){ await p.mouse.move(box.x + box.w/2, box.y + box.h/2); await p.mouse.wheel(0, -240); await p.waitForTimeout(60); const lv = await p.evaluate(()=>__STARMAP.debug().level); if(lv !== 'sector') break; }
 await p.waitForTimeout(900);
 out.sys = await p.evaluate(()=>__STARMAP.debug());
 await p.screenshot({path:'m_system.jpg', type:'jpeg', quality:88, timeout:120000});
 // planète la plus peuplée : clic, puis bouton « ORBIT VIEW »
 const hits = await p.evaluate(()=>__STARMAP._hits());
 out.sysHits = hits.map(h => h.kind + ':' + h.name).slice(0, 20);
 const vis = await p.evaluate(()=>__CINE.visit().target.properName);
 const ph = hits.find(h => h.kind === 'planet' && h.name === vis) || hits.find(h => h.kind === 'planet');
 await p.mouse.click(box.x + ph.x, box.y + ph.y); await p.waitForTimeout(500);
 out.selPanel = await p.evaluate(()=>document.querySelector('#stmMap .info').innerText.replace(/\n/g,' | '));
 await p.click('#stmMap .acts [data-a=orb]'); await p.waitForTimeout(900);
 out.planet = await p.evaluate(()=>__STARMAP.debug());
 await p.screenshot({path:'m_planet.jpg', type:'jpeg', quality:88, timeout:120000});
 const ph2 = await p.evaluate(()=>__STARMAP._hits());
 out.planetHits = ph2.map(h => h.kind + ':' + h.name);
 // double-clic sur un vaisseau non héros → la caméra y va
 const heroN = await p.evaluate(()=>__CINE.mapState().hero.name); const sh = ph2.find(h => h.kind === 'ship' && h.name !== heroN);
 const shipName = sh && sh.name;
 if(sh){ await p.mouse.dblclick(box.x + sh.x, box.y + sh.y); await p.waitForTimeout(600); }
 await p.evaluate(()=>{ __CINE.step(0.05, true); });
 out.afterShip = await p.evaluate(()=>({ open: __STARMAP.isOpen(), toast: document.getElementById('sttToast').textContent, cap: __CINE.caption().name, want: null }));
 out.afterShip.want = shipName;
 // réouverture : retour au secteur (Retour arrière ×2), clic sur une étoile lointaine, bouton « prochain saut »
 await p.keyboard.press('m'); await p.waitForTimeout(600);
 await p.keyboard.press('Backspace'); await p.waitForTimeout(700); await p.keyboard.press('Backspace'); await p.waitForTimeout(900);
 out.back = await p.evaluate(()=>__STARMAP.debug().level);
 await p.mouse.move(box.x + box.w/2, box.y + box.h/2); for(let i=0;i<3;i++){ await p.mouse.wheel(0, 300); await p.waitForTimeout(80); }
 await p.waitForTimeout(700);
 const sh3 = await p.evaluate(()=>__STARMAP._hits());
 const ms = await p.evaluate(()=>__CINE.mapState());
 const far = sh3.filter(h => h.kind === 'star' && h.key.indexOf(ms.cur.cell) < 0 && h.key.indexOf(ms.next.cell) < 0 && h.x > 60 && h.x < box.w - 60 && h.y > 40 && h.y < box.h - 40).sort((a, b) => Math.hypot(a.x - box.w/2, a.y - box.h/2) - Math.hypot(b.x - box.w/2, b.y - box.h/2))[2];
 await p.mouse.click(box.x + far.x, box.y + far.y); await p.waitForTimeout(500);
 await p.screenshot({path:'m_sector2.jpg', type:'jpeg', quality:88, timeout:120000});
 out.farPanel = await p.evaluate(()=>document.querySelector('#stmMap .info').innerText.replace(/\n/g,' | '));
 await p.click('#stmMap .acts [data-a=go]'); await p.waitForTimeout(500);
 out.afterFar = await p.evaluate(()=>({ open: __STARMAP.isOpen(), toast: document.getElementById('sttToast').textContent, next: __CINE.mapState().next.name }));
 out.farName = far.name;
 out.nebulae = sh3.filter(h => h.kind === 'nebula').map(h => h.name).slice(0, 6);
 // ouvertures / fermetures répétées
 const t0 = Date.now();
 for(let i=0;i<30;i++){ await p.keyboard.press('m'); await p.waitForTimeout(30); await p.keyboard.press('Escape'); await p.waitForTimeout(20); }
 out.cycles = { ms: Date.now() - t0, open: await p.evaluate(()=>__STARMAP.isOpen()) };
 await p.keyboard.press('r'); await p.waitForTimeout(300); out.radarOff = await p.evaluate(()=>__RADAR.stats()); await p.keyboard.press('r');
 await p.evaluate(()=>__RADAR._reset()); await p.waitForTimeout(3000); out.radar2 = await p.evaluate(()=>__RADAR.stats());
 await p.screenshot({path:'m_radar2.jpg', type:'jpeg', quality:88, timeout:120000});
 console.log(JSON.stringify(Object.assign(out, { errs: errs.slice(0,8) }), null, 1));
 await b.close();
})();
