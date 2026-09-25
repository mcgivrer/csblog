/* Chaque modèle s'installe dans le jeu et se raccorde à tous les systèmes (jauges, RCS, dock, bras, balises, caméra). */
module.exports = { name:'installation des dix modèles', timeout:300, async run({ newPage, url, assert }){
  const page = await newPage(); await page.goto(url());
  await page.waitForFunction(() => typeof SHIPGEN !== 'undefined' && SHIP_BUILD);
  const rows = await page.evaluate(() => SHIPGEN.MODELS.map(M => {
    installShip(M.id, {});
    const st = SHIP_BUILD.stats;
    return { id:M.id, engines:st.engines, gauges:window.__gaugeEls.main.length, temps:engineTemps.length, rcs:window.__rcs.length,
             dock:!!window.shipDockAnchor && !!window.shipDockAnchor.parent, arm:!!window.shipArm, beacons:window.__beacons.length,
             cam:CAM_OFFSET.z, ftl:!!M.ftl, warp:SHIP_WARP, jump:hasQuantumJump, factor:WARP_FACTOR };
  }));
  for(const r of rows){
    assert.ok(r.engines >= 1 && r.gauges === r.engines && r.temps === r.engines, r.id + ' : jauges/températures ≠ tuyères');
    assert.ok(r.rcs >= 4, r.id + ' : RCS manquants'); assert.ok(r.dock && r.arm, r.id + ' : dock ou bras absent');
    assert.ok(r.beacons >= 2, r.id + ' : balises'); assert.ok(r.cam > 35 && r.cam < 90, r.id + ' : caméra hors gabarit');
    assert.strictEqual(r.warp, r.ftl, r.id + ' : supraluminique'); assert.strictEqual(r.jump, r.ftl, r.id + ' : saut');
    if(r.ftl) assert.ok(r.factor >= 5 && r.factor <= 10, r.id + ' : facteur supraluminique hors ×5–×10');
  }
} };
