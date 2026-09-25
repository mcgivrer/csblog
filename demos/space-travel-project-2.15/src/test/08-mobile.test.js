/* Mobile : sélection et embarquement au doigt sur smartphone en portrait, commandes tactiles affichées. */
module.exports = { name:'smartphone en portrait', timeout:300, async run({ newPage, url, assert, game }){
  const page = await newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  await page.goto(url()); await game.toSelection(page);
  const box = await page.$eval('.ss-panel', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  assert.ok(box[0] <= 390, 'dialogue plus large que l\'écran');
  /* toucher réel aux coordonnées du bouton (page.tap attendrait une page « stable », jamais atteinte avec l'aperçu 3D en rendu logiciel) */
  const b = await page.$eval('#ssConfirm', e => { const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; });
  await page.touchscreen.tap(b[0], b[1]);
  await page.waitForFunction(() => gameStarted, null, { timeout:30000 });
  const touch = await page.evaluate(() => ({ mode:document.body.classList.contains('touch-mode'), shown:getComputedStyle(document.getElementById('touchControls')).display !== 'none' }));
  assert.ok(touch.mode && touch.shown, 'commandes tactiles absentes');
} };
