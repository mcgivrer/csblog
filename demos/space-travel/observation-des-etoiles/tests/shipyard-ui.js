// chantier (v7.18) : catalogue complet, vignettes, aperçu 3D, curseurs âge / usure, vaisseau choisi dans la scène ; node t77.js [graine] [préfixe] ; MOBILE=1 : écran de téléphone
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const seed = process.argv[2] || 'OBS-4', pre = process.argv[3] || 'y18', mob = !!process.env.MOBILE;
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage(mob ? { viewport:{width:390,height:844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport:{width:1280,height:760} });
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&stopover=0&trip=0&combat=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.getElementById('sttTitle').style.display = 'none'; const v = __CINE.visit(); while(__CINE.time() < v.tO0 + 3) __CINE.step(.25, true); });
 const o = await p.evaluate(()=>__DEMO.openYard()); console.log('open', o);
 const t0 = Date.now(); await p.waitForFunction(()=>__YARD.state().queue === 0, null, { timeout: 240000, polling: 500 }); console.log('thumbs in', ((Date.now() - t0)/1000).toFixed(1) + ' s');
 console.log('state', JSON.stringify(await p.evaluate(()=>__YARD.state())));
 const cards = await p.evaluate(()=>[...document.querySelectorAll('#sttYard .cd')].map(c => c.dataset.id + ':' + c.querySelector('[data-len]').textContent));
 console.log('cards', cards.length, cards.join(' '));
 await p.waitForTimeout(400); await p.screenshot({ path: `${pre}_open.jpg`, type: 'jpeg', quality: 86, timeout: 180000 });
 const shots = [['destroyer', .9, .12, 'old'], ['destroyer', .15, .95, 'worked'], ['p44', 0, 0, 'new'], ['p44', 1, 1, 'wreck'], ['carrierMil', .5, .5, 'carrier'], ['drone:relay', .6, .7, 'drone'], ['tM', .9, .08, 'tugOld'], ['tM', .08, .95, 'tugWorked'], ['tM', 0, 0, 'tugNew']];
 for(const [id, a, w, nm] of shots){ const st = await p.evaluate(([id, a, w, nm])=>{ __YARD.pick(id); __YARD.setLook(a, w); if(/^tug/.test(nm)) __YARD.view(-1.25, .12, .42); return __YARD.state(); }, [id, a, w, nm]); await p.waitForTimeout(700);
   console.log('look', id, nm, JSON.stringify(st.uniforms), 'build', st.buildMs + ' ms', 'frame', st.msPerFrame + ' ms');
   const r = await p.evaluate(()=>{ const c = document.querySelector('#sttYard .vw canvas').getBoundingClientRect(); return [c.x, c.y, c.width, c.height]; });
   await p.screenshot({ path: `${pre}_v_${nm}.jpg`, type: 'jpeg', quality: 88, clip: { x: r[0], y: r[1], width: r[2], height: r[3] }, timeout: 180000 }); }
 await p.keyboard.press('Escape'); await p.waitForTimeout(200); console.log('after Esc open?', await p.evaluate(()=>__YARD.isOpen()), 'demo yardOpen', await p.evaluate(()=>__DEMO.yardOpen()));
 // vaisseau choisi : modèle du jeu, engin, porte-vaisseaux
 for(const [id, a, w] of [['e18', .82, .25], ['drone:relay', .3, .9], ['carrierMil', .1, .6]]){
   await p.evaluate(()=>__DEMO.openYard()); await p.waitForTimeout(300);
   await p.evaluate(([id, a, w])=>{ __YARD.pick(id); __YARD.setLook(a, w); }, [id, a, w]); await p.waitForTimeout(300);
   await p.click('#sttYard .ac .use'); await p.waitForTimeout(300);
   const r = await p.evaluate(()=>{ for(let i = 0; i < 90; i++) __CINE.step(1/30, true); const s = __CINE.visit().showcase || __CINE.subject(), sub = __CINE.subject(); const toast = document.getElementById('sttToast').textContent;
     return { show: s && (s.model + ':' + s.type), subj: sub && sub.model, look: __CINE.lookOf(s), toast: toast.slice(0, 110) }; });
   console.log('use', id, JSON.stringify(r)); }
 await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); }))); await p.waitForTimeout(100); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/60, false); res(); })));
 await p.screenshot({ path: `${pre}_scene.jpg`, type: 'jpeg', quality: 86, timeout: 180000 });
 console.log('errors', errs.length, errs.slice(0, 4)); await b.close();
})();
