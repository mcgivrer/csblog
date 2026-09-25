/* Escale : un long-courrier parti sans générateur l'achète au port (coque remontée, dock et bras intacts) ; refus pour les autres. */
module.exports = { name:'achat du générateur de saut en escale', timeout:300, async run({ newPage, url, assert, game }){
  const page = await newPage(); await page.goto(url()); await game.board(page, 'g1', { warp:true, jump:false });
  const r = await page.evaluate(() => {
    const before = { jump:hasQuantumJump, dock:window.shipDockAnchor, arm:window.shipArm };
    addCredits(50000); buyQuantumJump();
    return { before:before.jump, after:hasQuantumJump, core:SHIP_BUILD.stats.jumpCore, rings:SHIP_BUILD.stats.rings,
             dock:window.shipDockAnchor === before.dock, arm:window.shipArm === before.arm, gauges:window.__gaugeEls.main.length };
  });
  assert.ok(!r.before && r.after && r.core === 1, 'générateur non posé'); assert.strictEqual(r.rings, 2, 'anneaux perdus');
  assert.ok(r.dock && r.arm, 'dock ou bras reconstruits'); assert.strictEqual(r.gauges, 4);
  await page.close();                                               /* libère le rendu 3D avant la seconde page */
  const page2 = await newPage(); await page2.goto(url()); await game.board(page2, 'tM');
  const txt = await page2.evaluate(() => { refreshJumpPortRow(); return document.getElementById('jumpBuyBtn').textContent; });
  assert.strictEqual(txt, 'Réservé aux long-courriers');
  /* panneau « Commandes moteur » : plage de réacteurs au nombre réel de tuyères (Sirocco : 3), plus « 1-4 » figé */
  await page2.waitForFunction(() => /R\u00c9ACTEURS 1-3/.test(document.getElementById('telemetryPanel').textContent), null, { timeout:60000 });
} };
