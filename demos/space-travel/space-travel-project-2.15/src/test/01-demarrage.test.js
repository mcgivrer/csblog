/* Démarrage : chargement sans erreur, écran-titre, mention légale, graine imposée par l'URL,
   et générique passé d'un clic sans que l'écran-titre revienne ensuite (défaut corrigé en v2.15). */
module.exports = { name:'démarrage, écran-titre, graine reproductible', timeout:240, async run({ newPage, url, assert }){
  const page = await newPage(); await page.goto(url({ seed:'GRAINE-TEST' }));
  /* joueur pressé : clic dès l'apparition du générique, partie lancée aussitôt l'écran-titre affiché,
     avant la fin du défilement automatique du générique */
  await page.waitForSelector('#boot');
  await page.evaluate(() => document.getElementById('boot').dispatchEvent(new Event('click')));
  await page.waitForFunction(() => document.getElementById('titleScreen').style.display === 'flex', null, { timeout:30000 });
  await page.waitForFunction(() => typeof window.__sttQuickStart === 'function' && typeof SHIPGEN !== 'undefined');
  await page.evaluate(() => window.__sttQuickStart('tS', {}));
  /* rendu 3D coupé pendant l'attente : en rendu logiciel, chaque image monopolise le processeur et
     retarde de plusieurs dizaines de secondes les minuteries du générique qu'on veut observer */
  await page.evaluate(() => { renderer.render = function(){}; });
  /* on attend la fin RÉELLE du défilement (dernière ligne « AUTOPILOTE ») puis une marge :
     sa durée varie beaucoup d'une machine à l'autre, une attente fixe ne prouverait rien */
  let endAt = null;
  for(let i = 0; i < 300; i++){
    const st = await page.evaluate(() => ({ title:document.getElementById('titleScreen').style.display, active:document.body.classList.contains('title-active'),
      done:/AUTOPILOTE/.test((document.getElementById('bootTerm').lastElementChild || {}).textContent || '') }));
    assert.ok(st.title === 'none' && !st.active, 'l\'écran-titre est revenu par-dessus la partie');
    if(st.done && endAt === null) endAt = Date.now();
    if(endAt !== null && Date.now() - endAt > 4000) break;
    await page.waitForTimeout(500);
  }
  assert.ok(endAt !== null, 'fin du générique jamais observée');
  assert.strictEqual(await page.textContent('#seedVal'), 'GRAINE-TEST');
  assert.match(await page.textContent('#titleCopyright'), /Frédéric Delorme.*ScoreStudio/);
  assert.strictEqual(await page.evaluate(() => typeof MUSIC_PATH), 'string');
} };
