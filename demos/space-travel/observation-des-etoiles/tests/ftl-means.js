// moyens de saut (v7.2.2) : départs par saut / distorsion selon l'équipement réel ; sélecteur (vedette, bascule) — node t60.js [graine]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const seed = process.argv[2] || 'OBS-2';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:640,height:360}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; window.__toasts = []; const t0 = __DEMO.toast; __DEMO.toast = h => { __toasts.push(h.replace(/<[^>]+>/g, '')); t0(h); }; });
 await p.click('#sttStart'); await p.waitForTimeout(200);
 const r = await p.evaluate(()=>{
   const out = { visits: [], bad: [] }, next = () => { const te = __CINE.timings().tEnd + 1; while(__CINE.time() < te) __CINE.step(.5, true); };
   const check = tag => { const t = __CINE.timings(), e = t.depEquip || {};
     const ok = (t.mode === 'jump' ? e.jump && t.depGeode : e.warp && t.depRings) && (e.jump === t.depGeode) && (e.warp === t.depRings);
     const v = { tag, dep: t.departer, mode: t.mode, equip: (e.jump ? 'J' : '') + (e.warp ? 'W' : ''), showcase: t.showcase, ok }; out.visits.push(v); if(!ok) out.bad.push(v); };
   for(let i = 0; i < 8; i++){ check('auto' + i); next(); }
   // sélecteur : vaisseau sans moyens (vedette), puis paquebot sans cœur de saut, puis paquebot sans anneaux
   const setAt = (model, opts) => { const t = __CINE.timings(); while(__CINE.time() < t.tO0 + 2) __CINE.step(.25, true); return __CINE.setHero(model, opts); };
   out.sel1 = setAt('x1'); check('x1'); while(__CINE.time() < __CINE.timings().depStart) __CINE.step(.25, true); out.toast1 = __toasts.slice(-1)[0]; next();
   let g = 0; while(__CINE.timings().mode !== 'jump' && g++ < 6) next();
   out.sel2 = setAt('l20', { warp: true, jump: false }); check('l20-warp-only'); next();
   g = 0; while(__CINE.timings().mode !== 'warp' && g++ < 6) next();
   out.sel3 = setAt('l20', { warp: false, jump: true }); check('before-next'); next(); check('l20-jump-only');
   return out;
 });
 console.log(JSON.stringify(r, null, 1)); console.log('errors', errs.length, errs.slice(0, 3));
 await b.close();
})();
