/* Saut quantique : séquence complète (charge, pli, saut, onde), téléportation, retour à l'état normal. */
module.exports = { name:'saut quantique : séquence et téléportation', timeout:300, async run({ newPage, url, assert, game }){
  const page = await newPage(); await page.goto(url()); await game.board(page, 'g1', { warp:false, jump:true });
  const r = await page.evaluate(() => {
    const before = shipRig.position.clone(); let peak = 0, lens = 0;
    jumpState = { phase:'charge', t:0, targetPos:before.clone().add(new THREE.Vector3(0, 0, -4000)), fuelCost:0, teleported:false };
    for(let i = 0; i < 200 && jumpState; i++){ updateJumpSequence(0.05); peak = Math.max(peak, SHIPGEN.JUMP_U.uCharge.value); lens = Math.max(lens, WARP.mat.uniforms.uLens.value); }
    return { done:jumpState === null, moved:shipRig.position.distanceTo(before), peak:peak, lens:lens, active:WARP.active,
             charge:SHIPGEN.JUMP_U.uCharge.value, scale:shipMesh.scale.toArray() };
  });
  assert.ok(r.done, 'séquence non terminée'); assert.ok(Math.abs(r.moved - 4000) < 1, 'téléportation : ' + r.moved);
  assert.ok(r.peak > 1.5 && r.lens > 0.9, 'charge ou déformation insuffisante');
  assert.ok(!r.active && r.charge === 0 && r.scale.every(v => v === 1), 'état non restauré après le saut');
} };
