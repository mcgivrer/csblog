/* Croisière supraluminique : vitesse ×N loin des étapes, coupée avant la zone d'approche, consommation au km inchangée. */
module.exports = { name:'croisière supraluminique (×5 à ×10)', timeout:300, async run({ newPage, url, assert, game }){
  const page = await newPage(); await page.goto(url()); await game.board(page, 'l20', { warp:true, jump:false });
  /* plus longue étape restante de la route (les premières peuvent être courtes selon la graine) */
  const leg = await page.evaluate(() => {
    let best = ROUTE.nextDelivery, len = 0;
    for(let k = ROUTE.nextDelivery; k < ROUTE.legS.length; k++){ const a = k ? ROUTE.legS[k - 1] : 0, l = ROUTE.legS[k] - a; if(l > len){ len = l; best = k; } }
    ROUTE.nextDelivery = best; return { from:best ? ROUTE.legS[best - 1] : 0, to:ROUTE.legS[best], len:len };
  });
  assert.ok(leg.len > 3000, 'aucune étape assez longue pour le test (' + Math.round(leg.len) + ' u)');
  await game.placeOnRoute(page, Math.max(leg.from + 50, leg.to - 9000));
  const r = await page.evaluate(() => {
    const f0 = fuel, s0 = ROUTE.s, k0 = ROUTE.nextDelivery; let tt = 0, lvl = 0, v = 0;
    for(let i = 0; i < 200 && ROUTE.nextDelivery === k0 && ROUTE.legS[k0] - ROUTE.s > 1700; i++){
      updateFlight(0.05, tt += 0.05); lvl = Math.max(lvl, WARP_LEVEL); v = Math.max(v, currentSpeed);
    }
    return { level:lvl, speed:v, cruise:effectiveCruiseSpeed(), factor:WARP_FACTOR, burn:f0 - fuel, dist:ROUTE.s - s0 };
  });
  assert.ok(r.level > 0.9, 'supraluminique non engagée (niveau max ' + r.level.toFixed(2) + ')');
  assert.ok(r.speed > r.cruise*r.factor*0.8, 'vitesse max ' + Math.round(r.speed) + ' u/s pour ×' + r.factor);
  assert.ok(r.burn < r.dist*1.3, 'consommation au km anormale (' + Math.round(r.burn) + ' pour ' + Math.round(r.dist) + ' u)');
  /* à l'approche : coupure en moins de 2 s, depuis la pleine vitesse */
  await game.placeOnRoute(page, leg.to - 1500);
  const near = await page.evaluate(() => { WARP_LEVEL = 1; currentSpeed = effectiveCruiseSpeed()*WARP_FACTOR; let tt = 0; for(let i = 0; i < 40; i++) updateFlight(0.05, tt += 0.05); return WARP_LEVEL; });
  assert.ok(near < 0.3, 'supraluminique non coupée à l\'approche (' + near.toFixed(2) + ')');
} };
