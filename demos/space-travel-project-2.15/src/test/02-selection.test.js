/* Écran de sélection : dix vaisseaux du plus petit au plus grand, options de propulsion selon l'éligibilité. */
module.exports = { name:'écran de sélection et options de propulsion', async run({ newPage, url, assert, game }){
  const page = await newPage(); await page.goto(url()); await game.toSelection(page);
  const lens = await page.evaluate(() => SHIP_CATALOG.map(c => c.len));
  assert.strictEqual(lens.length, 10, 'dix modèles attendus');
  for(let i = 1; i < lens.length; i++) assert.ok(lens[i] >= lens[i - 1], 'catalogue non trié par longueur');
  const row = label => page.evaluate(l => { const dt = [...document.querySelectorAll('#ssKv dt')].find(d => d.textContent === l); return dt ? dt.nextElementSibling.textContent : null; }, label);
  await game.present(page, 'tS');                                    /* petit vaisseau : options grisées */
  assert.ok(await page.$eval('#ssOptW', b => b.disabled) && await page.$eval('#ssOptJ', b => b.disabled));
  assert.strictEqual(await row('Saut quantique'), 'Non disponible');
  await game.present(page, 'g1');                                    /* long-courrier : les deux options par défaut */
  assert.strictEqual(await page.getAttribute('#ssOptW', 'aria-pressed'), 'true');
  assert.strictEqual(await page.getAttribute('#ssOptJ', 'aria-pressed'), 'true');
  assert.match(await row('Supraluminique'), /^×(5|6|7|8|9|10) — anneaux de distorsion ×2$/);
  assert.strictEqual(await row('Saut quantique'), 'Générateur de saut');
  const wide = await page.evaluate(() => document.querySelectorAll('#ssKv dd')[2].textContent);
  await page.$eval('#ssOptW', b => b.click());                                       /* sans anneaux : plus étroit, supraluminique non installée */
  assert.strictEqual(await row('Supraluminique'), 'Non installée');
  const narrow = await page.evaluate(() => document.querySelectorAll('#ssKv dd')[2].textContent);
  assert.ok(parseInt(narrow) < parseInt(wide), 'la largeur doit diminuer sans anneaux');
  await page.keyboard.press('ArrowDown');                            /* cycle clavier : (non, oui) → (oui, oui) */
  assert.strictEqual(await page.getAttribute('#ssOptW', 'aria-pressed'), 'true');
} };
