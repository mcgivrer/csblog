// combat II (v7.14) : engagement (escarmouche ou duel de ligne) — déroulé, missiles, interceptions, plans, FLEET — node t73.js [skirmish|duel] [graine] [préfixe]
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const kind = process.argv[2] || 'skirmish', seed = process.argv[3] || 'OBS-4', pre = process.argv[4] || 'e18' + kind[0];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:620}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&carrier=0&dof=0&stopover=0&trip=0&combat=' + kind);
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.getElementById('sttTitle').style.display = 'none'; });
 const shotPage = async (name) => { await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/30, false); res(); }))); await p.waitForTimeout(90); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/30, false); res(); }))); await p.screenshot({ path: `${pre}_${name}.jpg`, type: 'jpeg', quality: 86 }); };
 const e0 = await p.evaluate(()=>{ const E = __CINE.engDbg(); return E; }); console.log('eng', JSON.stringify(e0));
 // déroulé : état toutes les 3 s, plans choisis par le réalisateur
 const log = await p.evaluate(()=>{ const E = __CINE.engDbg(); while(__CINE.time() < E.tA - 1) __CINE.step(.25, true); const out = [], shots = []; let last = null;
   while(__CINE.time() < E.tB + 4){ const o = __CINE.step(1/30, true); if(o.shot !== last || __CINE.shotStart() !== window.__ls){ last = o.shot; window.__ls = __CINE.shotStart(); shots.push(Math.round(__CINE.time()) + ':' + o.shot + '[' + (o.cap && (o.cap.name + '|' + (o.cap.planet || '').slice(0, 12))) + ']'); } if(Math.round(__CINE.time()*30) % 90 === 0){ const d = __CINE.engDbg(); out.push(d.T + ' tr' + d.tr + ' mis' + d.mis + '/' + d.misAll + ' ' + d.ships.join(' ') + (d.over ? ' OVER w' + d.winner : '')); } }
   return { out, shots }; });
 log.out.forEach(l => console.log(' ', l)); console.log('shots', log.shots.join(' '));
 if(process.env.CAP){ // captures : plans forcés au milieu d'un nouvel engagement (FLEET, système suivant)
   const r = await p.evaluate(([kind])=>{ const r = __CINE.startCombat(kind); const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const E = __CINE.engDbg(); while(__CINE.time() < E.tA + 13) __CINE.step(1/15, true); return { r, E: __CINE.engDbg() }; }, [kind]);
   console.log('cap', JSON.stringify(r));
   const types = kind === 'duel' ? ['battleWide', 'duelSide', 'missileCam', 'turretClose', 'lateral'] : ['battleWide', 'dogfight', 'missileCam', 'lateral', 'orbitcam'];
   for(const t of types){ const ok = await p.evaluate(([t])=>{ const v = __CINE.visit(), E = v.eng; if(!E) return 'noeng'; let s = E.ships.find(x => !(x.hp && x.hp.disabled)) || E.ships[0];
       if(t === 'dogfight'){ s = E.ships.find(x => { const st = x.traj(__CINE.time()), rel = x.cbOpp.traj(__CINE.time()).pos.sub(st.pos); return rel.length() < 1400 && !(x.hp && x.hp.disabled); }) || s; }
       if(t === 'missileCam'){ const m = E.missiles.find(m => !m.dead); if(!m){ for(let i = 0; i < 90 && !E.missiles.find(m => !m.dead); i++) __CINE.step(1/15, true); } const m2 = E.missiles.find(m => !m.dead); if(m2) s = m2.sh; }
       const ty = __CINE.forceShotOn(t, s, 6); for(let i = 0; i < 24; i++) __CINE.step(1/30, true); return ty; }, [t]); console.log('shot', t, ok); await shotPage(t); }
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
