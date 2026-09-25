/* =============================================================================
   Captures d'écran de la spécification — node build.js captures
   Rejoue chaque situation illustrée dans src/docs/spec/*.md et écrit les images
   dans src/docs/spec/images (mêmes noms : les documents n'ont pas à changer).
   Graine fixe (CAPTURE_SEED) : deux exécutions donnent le même univers.
   Le temps de jeu est accéléré sans rendu entre deux prises (game.fastForward),
   puis figé pendant chaque prise (game.freeze) pour une image nette.
   ============================================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const { launch, serve, isolate, game } = require('./lib/harness.js');

exports.run = async function({ page:pageFile, out, demos }){
  const srv = await serve(path.dirname(pageFile)), port = srv.address().port;
  const seed = process.env.CAPTURE_SEED || 'CAPTURE-2026';
  const url = `http://127.0.0.1:${port}/${path.basename(pageFile)}?seed=${seed}`;
  const only = process.argv.find(a => a.startsWith('--only=')); const want = only ? only.split('=')[1].split(',') : null;
  const browser = await launch();
  console.log('\u203a captures (graine ' + seed + ') → ' + out);

  async function open(opts){
    const ctx = await browser.newContext(Object.assign({ viewport:{ width:1280, height:720 } }, opts || {}));
    const p = await ctx.newPage(); await isolate(p);
    p.setDefaultTimeout(90000); p.setDefaultNavigationTimeout(180000);
    p.on('pageerror', e => console.log('  ! erreur page : ' + e.message));
    return { ctx, p };
  }
  async function shot(p, name, how){
    await game.freeze(p);
    const f = path.join(out, name), o = { path:f, type:'jpeg', quality:85 };
    if(how && how.clip) await p.screenshot(Object.assign(o, { clip:how.clip }));
    else if(how && how.el) await (await p.$(how.el)).screenshot(o);
    else await p.screenshot(o);
    await game.unfreeze(p);
    console.log('  \u2713 ' + name + (how && how.note ? ' — ' + how.note : ''));
  }
  /* rectangle englobant plusieurs panneaux du HUD */
  const around = (p, sels) => p.evaluate(sels => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for(const s of sels){ const e = document.querySelector(s); if(!e) continue; const r = e.getBoundingClientRect(); if(!r.width || !r.height) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    const m = 8, x = Math.max(0, x0 - m), y = Math.max(0, y0 - m);
    return { x, y, width:Math.min(innerWidth, x1 + m) - x, height:Math.min(innerHeight, y1 + m) - y };
  }, sels);
  const pick = (...names) => !want || names.some(n => want.some(w => n.includes(w)));

  try{
    /* ---- écran-titre, sélection */
    if(pick('img-001', 'img-032', 'img-033')){
      const { ctx, p } = await open(); await p.goto(url);
      await p.waitForFunction(() => typeof SHIPGEN !== 'undefined'); await p.waitForTimeout(800);
      await p.evaluate(() => document.getElementById('boot').dispatchEvent(new Event('click')));
      await p.waitForFunction(() => document.getElementById('titleScreen').style.display === 'flex'); await p.waitForTimeout(3500);
      await shot(p, 'img-001.jpg'); fs.copyFileSync(path.join(out, 'img-001.jpg'), path.join(out, 'img-032.jpg')); console.log('  \u2713 img-032.jpg (= img-001)');
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.getElementById('shipSelect').classList.contains('open'));
      await game.present(p, 'g1', { warp:true, jump:true }); await p.waitForTimeout(2500);
      await shot(p, 'img-033.jpg', { note:'Banquise, supraluminique + saut' });
      await ctx.close();
    }
    /* ---- croisière (cargo-entrepôt), panneaux, overlays, arrivée */
    if(pick('img-002', 'img-003', 'img-005', 'img-006', 'img-012', 'img-021', 'img-022', 'img-028', 'img-031')){
      const { ctx, p } = await open(); await p.goto(url); await game.quickBoard(p, 'e18');
      await game.fastForward(p, 6);
      await shot(p, 'img-002.jpg', { note:'Carrelet en croisière' });
      await shot(p, 'img-005.jpg', { clip:await around(p, ['#routePanel']) });
      await shot(p, 'img-012.jpg', { clip:await around(p, ['#tempPanel', '#enginesPanel', '#telemetryPanel']) });
      await shot(p, 'img-028.jpg', { clip:await around(p, ['#itineraryPanel', '#lagrangePanel']) });
      await game.fastForward(p, 8); await shot(p, 'img-006.jpg');
      await game.fastForward(p, 12); await shot(p, 'img-003.jpg');
      /* pause : P l'ouvre, Entrée (ou Espace) la referme ; aide et volumes : même touche pour ouvrir et fermer */
      await p.keyboard.press('KeyP'); await p.waitForTimeout(900); await shot(p, 'img-021.jpg');
      await p.keyboard.press('Enter'); await p.waitForTimeout(700);
      if(await p.evaluate(() => gamePaused)) throw new Error('la pause ne s\'est pas refermée');
      for(const [key, name] of [['KeyH', 'img-022.jpg'], ['KeyV', 'img-031.jpg']]){
        await p.keyboard.press(key); await p.waitForTimeout(900); await shot(p, name); await p.keyboard.press(key); await p.waitForTimeout(600);
      }
      await ctx.close();
    }
    /* ---- arrivée à une étape : système planétaire, approche, orbite et navettes, panneaux, radio */
    if(pick('img-007', 'img-008', 'img-009', 'img-010', 'img-011')){
      const { ctx, p } = await open(); await p.goto(url); await game.quickBoard(p, 'e18');
      /* plus longue étape de la route : la première peut être trop courte pour une approche de 2 600 u */
      const to = await p.evaluate(() => {
        let best = ROUTE.nextDelivery, len = 0;
        for(let k = ROUTE.nextDelivery; k < ROUTE.legS.length; k++){ const a = k ? ROUTE.legS[k - 1] : 0, l = ROUTE.legS[k] - a; if(l > len){ len = l; best = k; } }
        ROUTE.nextDelivery = best; return ROUTE.legS[best];
      });
      await game.placeOnRoute(p, to - 2600); await game.fastForward(p, 3); await shot(p, 'img-007.jpg', { note:'système planétaire' });
      await game.placeOnRoute(p, to - 1100); await game.fastForward(p, 3); await shot(p, 'img-008.jpg', { note:'approche' });
      await game.placeOnRoute(p, to - 350);
      for(let i = 0; i < 12 && !(await p.evaluate(() => flightPhase === 'ARRIVAL_PAUSE')); i++) await game.fastForward(p, 5);
      await game.fastForward(p, 12);
      await shot(p, 'img-009.jpg', { note:'orbite et navettes' });
      await shot(p, 'img-010.jpg', { clip:await around(p, ['#nearestPanel', '#portPanel', '#radioPanel']) });
      await shot(p, 'img-011.jpg', { el:'#radioPanel' });
      await ctx.close();
    }
    /* ---- long-courrier : vol, carte stellaire, saut quantique */
    if(pick('img-034', 'img-035', 'img-036', 'img-037', 'img-039')){
      const { ctx, p } = await open(); await p.goto(url); await game.quickBoard(p, 'g1', { warp:true, jump:true });
      await game.fastForward(p, 5); await shot(p, 'img-034.jpg', { note:'Banquise en vol' });
      await p.keyboard.press('KeyM'); await p.waitForTimeout(3000); await shot(p, 'img-037.jpg', { note:'carte stellaire' });
      await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
      await p.evaluate(() => { jumpState = { phase:'charge', t:0, targetPos:shipRig.position.clone().add(new THREE.Vector3(0, 0, -4000).applyQuaternion(shipRig.quaternion)), fuelCost:0, teleported:false }; });
      for(const [t, name, note] of [[1.5, 'img-035.jpg', 'charge du générateur'], [2.6, 'img-039.jpg', 'pli de l\'espace-temps'], [2.97, 'img-036.jpg', 'éclair du saut']]){
        await p.evaluate(t => { if(jumpState){ jumpState.t = t - 0.001; updateJumpSequence(0.001); } }, t);
        await shot(p, name, { note });
      }
      await p.evaluate(() => { if(jumpState) jumpState.t = 99; }); await p.waitForTimeout(800);
      await ctx.close();
    }
    /* ---- croisière supraluminique (paquebot) */
    if(pick('img-038')){
      const { ctx, p } = await open(); await p.goto(url); await game.quickBoard(p, 'l20', { warp:true, jump:false });
      const leg = await p.evaluate(() => {
        let best = ROUTE.nextDelivery, len = 0;
        for(let k = ROUTE.nextDelivery; k < ROUTE.legS.length; k++){ const a = k ? ROUTE.legS[k - 1] : 0, l = ROUTE.legS[k] - a; if(l > len){ len = l; best = k; } }
        ROUTE.nextDelivery = best; return { from:best ? ROUTE.legS[best - 1] : 0, to:ROUTE.legS[best] };
      });
      await game.placeOnRoute(p, Math.max(leg.from + 50, leg.to - 9000)); await game.fastForward(p, 4);
      await shot(p, 'img-038.jpg', { note:'Belle-Étoile, supraluminique ×' + await p.evaluate(() => WARP_FACTOR) });
      await ctx.close();
    }
    /* ---- mobile et tablette */
    for(const [name, vp, dpr] of [['img-026.jpg', { width:390, height:844 }, 2], ['img-027.jpg', { width:1180, height:820 }, 1]]){
      if(!pick(name)) continue;
      const { ctx, p } = await open({ viewport:vp, isMobile:true, hasTouch:true, deviceScaleFactor:dpr });
      await p.goto(url); await game.quickBoard(p, 'p10'); await game.fastForward(p, 6);
      await shot(p, name, { note:'Hirondelle, commandes tactiles' }); await ctx.close();
    }
    /* ---- le vaisseau (§3) : maquette de la page de présentation */
    if(pick('img-004')){
      const { ctx, p } = await open();
      await p.goto('file://' + path.join(demos, 'maquettes-vaisseaux.html') + '?shot');
      await p.waitForFunction(() => window.__ready === true);
      await p.evaluate(() => { SR.select('tM'); SR.view('av'); SR.render(); }); await p.waitForTimeout(600);
      await p.screenshot({ path:path.join(out, 'img-004.jpg'), type:'jpeg', quality:85 }); console.log('  \u2713 img-004.jpg — Sirocco (page de présentation)');
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
};
