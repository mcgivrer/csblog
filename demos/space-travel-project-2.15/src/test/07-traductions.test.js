/* Traductions : tous les libellés de la sélection et des nouvelles propulsions existent dans les quatre langues. */
module.exports = { name:'libellés dans les quatre langues', async run({ newPage, url, assert }){
  const page = await newPage(); await page.goto(url()); await page.waitForFunction(() => typeof I18N !== 'undefined');
  const keys = ['ssTitle', 'ssNote', 'ssConfirm', 'ssHint', 'ssPropSel', 'ssOptE', 'ssOptW', 'ssOptJ', 'ssOptNote', 'ssWarp', 'ssWarpYes',
                'ssWarpOff', 'ssJump', 'ssJumpYes', 'ssJumpLater', 'ssJumpNo', 'ssProp', 'ssPropVal', 'portJumpLongHaul', 'starMapLongHaulOnly'];
  const missing = await page.evaluate(keys => ['fr', 'en', 'de', 'es'].flatMap(l => keys.filter(k => !I18N[l] || !I18N[l][k]).map(k => l + '.' + k)), keys);
  assert.deepStrictEqual(missing, [], 'libellés manquants');
} };
