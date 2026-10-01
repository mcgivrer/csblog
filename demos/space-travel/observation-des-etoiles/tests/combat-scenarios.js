// combat III (v7.15) : attaque de convoi, raid de pirates, assaut d'un porte-vaisseaux — déroulé, issue, plans ; node t74.js [convoy|raid|assault] [graine] [préfixe] ; CAP=1 : captures
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const kind = process.argv[2] || 'convoy', seed = process.argv[3] || 'OBS-4', pre = process.argv[4] || 'e19' + kind[0];
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:620}});
 const errs = []; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|supported/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html') + '?seed=' + seed + '&music=0&military=0&dof=0&stopover=0&trip=0&combat=' + kind + (process.env.CARRIER ? '&carrier=' + process.env.CARRIER : ''));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 await p.evaluate(()=>{ window.__DEMO_NOLOOP = true; }); await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.getElementById('sttTitle').style.display = 'none'; });
 const shotPage = async (name) => { await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/30, false); res(); }))); await p.waitForTimeout(90); await p.evaluate(()=>new Promise(res => window.__raf(()=>{ __CINE.step(1/30, false); res(); }))); await p.screenshot({ path: `${pre}_${name}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 }); };
 const e0 = await p.evaluate(()=>__CINE.engDbg()); console.log('eng', JSON.stringify(e0));
 const log = await p.evaluate(()=>{ const E = __CINE.engDbg(); while(__CINE.time() < E.tA - 1) __CINE.step(.25, true); const out = [], shots = [], toasts = [], calls = []; let last = null, t0 = performance.now(), n = 0;
   const tt = document.getElementById('sttToast'); let lastToast = '';
   while(__CINE.time() < E.tB + 6){ const o = __CINE.step(1/30, true); n++; if(o.shot !== last || __CINE.shotStart() !== window.__ls){ last = o.shot; window.__ls = __CINE.shotStart(); shots.push(Math.round(__CINE.time()) + ':' + o.shot + '[' + (o.cap && ((o.cap.planet || '').slice(0, 26))) + ']'); }
     const tx = tt ? tt.textContent : ''; if(tx && tx !== lastToast){ lastToast = tx; toasts.push(Math.round(__CINE.time()) + ' ' + tx.slice(0, 90)); }
     if(Math.round(__CINE.time()*30) % 90 === 0){ renderer.info.reset(); __CINE.step(1/60, false); calls.push(renderer.info.render.calls); const d = __CINE.engDbg(); out.push(d.T + ' tr' + d.tr + ' mis' + d.mis + '/' + d.misAll + ' ' + d.ships.join(' ') + (d.over ? ' OVER w' + d.winner + (d.fled ? ' fled' : '') + (d.withdrawn ? ' withdrawn' : '') : '')); } }
   return { out, shots, toasts, calls, ms: +((performance.now() - t0)/n).toFixed(2), E: __CINE.engDbg() }; });
 log.out.forEach(l => console.log(' ', l)); console.log('shots', log.shots.join(' ')); console.log('toasts', JSON.stringify(log.toasts)); console.log('ms/step', log.ms, 'calls', log.calls.join(','));
 console.log('result', log.E.kind, 'over', log.E.over, 'winner', log.E.winner, 'fled', log.E.fled, 'withdrawn', log.E.withdrawn);
 if(process.env.CAP){ // captures : engagement demandé au panneau FLEET, système suivant, plans imposés
   const r = await p.evaluate(([kind])=>{ const r = __CINE.startCombat(kind); const v0 = __CINE.visit(); while(__CINE.visit() === v0) __CINE.step(.25, true); const E = __CINE.engDbg(); while(__CINE.time() < E.tA + (E.kind === 'raid' ? 5 : 11)) __CINE.step(1/15, true); return { r, E: __CINE.engDbg() }; }, [kind]);
   console.log('cap', JSON.stringify(r));
   const T0 = { convoy: ['strafeRun', 'convoyPass', 'dogfight', 'battleWide', 'missileCam', 'duelSide'], raid: ['strafeRun', 'patrolArrival', 'dogfight', 'convoyPass', 'battleWide', 'missileCam'], assault: ['strafeRun', 'battleWide', 'duelSide', 'turretClose', 'dogfight', 'missileCam'] }[r.E.kind] || [];
   if(process.env.ONLY) T0.splice(0, T0.length, ...process.env.ONLY.split(','));
   for(const t of T0){ const ok = await p.evaluate(([t, PRE])=>{ const v = __CINE.visit(), E = v.eng; if(!E) return 'noeng'; const T = () => __CINE.time(), alive = x => !(x.hp && x.hp.disabled) && x.root.visible;
       let s = E.ships.find(alive) || E.ships[0];
       if(t === 'patrolArrival'){ if(T() > E.tP - 1) return 'late'; while(T() < E.tP - 1) __CINE.step(1/15, true); s = E.patrolLead; }
       if(t === 'patrolArrival'){ __CINE.forceShotOn(t, s, 8); for(let i = 0; i < 44; i++) __CINE.step(1/30, true); return 'patrolArrival T' + T().toFixed(1); }
       if(t === 'strafeRun'){ let f = null; for(let i = 0; i < 240 && !f; i++){ f = E.ships.find(x => x.model === 'fighter' && x.side === 1 && alive(x) && x.cbOpp && x.cbOpp.len > 90 && __CINE.strafeIn(x)); if(!f) __CINE.step(1/15, true); } if(!f) return 'norun'; s = f; }
       if(t === 'convoyPass') s = E.ships.find(x => x.civ) || s;
       if(t === 'dogfight'){ let f = null; for(let i = 0; i < 150 && !f; i++){ f = E.ships.find(x => { if(!alive(x) || !x.cbOpp || x.model !== 'fighter' || !alive(x.cbOpp)) return false; const st = x.traj(T()), rel = x.cbOpp.traj(T()).pos.sub(st.pos), fw = new THREE.Vector3(0, 0, -1).applyQuaternion(st.q); return rel.length() < 900 && rel.normalize().dot(fw) > .7; }); if(!f) __CINE.step(1/15, true); } s = f || s; }
       if(t === 'battleWide') s = E.ships.find(x => x.model === 'fighter' && alive(x) && x.cbOpp && alive(x.cbOpp)) || s;
       if(t === 'duelSide' || t === 'turretClose') s = E.ships.find(x => x.isCarrier) || E.ships.find(x => !x.civ && x.model !== 'fighter' && alive(x) && x.cbOpp) || s;
       if(t === 'missileCam'){ for(let i = 0; i < 150 && !E.missiles.find(m => !m.dead); i++) __CINE.step(1/15, true); const m2 = E.missiles.find(m => !m.dead); if(m2) s = m2.sh; }
       const ty = __CINE.forceShotOn(t, s, t === 'strafeRun' ? Math.max(3.5, s.cbRun.tp - T() + 1.5) : 7); const k = t === 'patrolArrival' ? 75 : t === 'strafeRun' ? Math.max(8, Math.round((s.cbRun.tp - T() - PRE)*30)) : t === 'convoyPass' ? 60 : 24;
       for(let i = 0; i < k; i++) __CINE.step(1/30, true); return ty + ' ' + (s.name || '') + ' T' + T().toFixed(1); }, [t, +(process.env.PRE || 1.3)]); console.log('shot', t, ok, JSON.stringify(await p.evaluate(()=>__CINE.camDbg()))); if(!/^(noeng|late|norun)/.test(ok)) await shotPage(t); }
 }
 console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
