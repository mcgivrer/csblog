/* =============================================================================
   Harnais de tests — Space Travel & Transport
   Chaque fichier src/test/NN-*.test.js exporte { name, run } ; run reçoit un
   contexte { newPage, url, assert, game } et échoue en levant une erreur.
   Toute erreur JavaScript de la page fait aussi échouer le test.
   ============================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.m4a':'audio/mp4', '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css' };

/* navigateur : Chromium de Playwright, ou CHROMIUM_PATH ; rendu logiciel pour tourner partout */
async function launch(){
  const { chromium } = require('playwright');
  const opts = { args:['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] };
  if(process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  return chromium.launch(opts);
}
function serve(dir){
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if(!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type':MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
/* réseau coupé pendant les tests : three.js (démos) servi depuis node_modules, polices ignorées */
async function isolate(page){
  await page.route('**/*', route => {
    const u = route.request().url();
    if(u === THREE_CDN) return route.fulfill({ path:require.resolve('three/build/three.min.js'), contentType:'text/javascript' });
    if(/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u) || u.startsWith('file:') || u.startsWith('data:')) return route.continue();
    return route.abort();
  });
}

/* ---------------------------------------------------------- aides de pilotage */
const game = {
  /* générique → choix de langue (Entrée = français) → dialogue de sélection ouvert */
  async toSelection(page){
    await page.waitForFunction(() => typeof SHIPGEN !== 'undefined' && document.getElementById('boot'), null, { timeout:30000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('boot').dispatchEvent(new Event('click')));
    await page.waitForFunction(() => document.getElementById('titleScreen').style.display === 'flex', null, { timeout:20000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('shipSelect').classList.contains('open'), null, { timeout:60000 });
    await page.waitForTimeout(300);
  },
  /* présente le vaisseau `id` dans le carrousel et règle ses options de propulsion */
  async present(page, id, opts){
    const i = await page.evaluate(id => SHIP_CATALOG.findIndex(c => c.id === id), id);
    if(i < 0) throw new Error('vaisseau inconnu : ' + id);
    await page.$eval('#ssStrip button:nth-child(' + (i + 1) + ')', b => b.click());   /* clic JS : l'aperçu 3D occupe la page */
    await page.waitForFunction(i => document.querySelectorAll('#ssStrip button')[i].getAttribute('aria-current') === 'true', i);
    opts = opts || {};
    for(const [key, sel] of [['warp', '#ssOptW'], ['jump', '#ssOptJ']]){
      if(opts[key] === undefined) continue;
      const on = await page.getAttribute(sel, 'aria-pressed') === 'true', disabled = await page.$eval(sel, b => b.disabled);
      if(!disabled && on !== !!opts[key]) await page.$eval(sel, b => b.click());
    }
    await page.waitForTimeout(200);
  },
  async board(page, id, opts){
    await game.toSelection(page);
    await game.present(page, id, opts);
    await page.$eval('#ssConfirm', b => b.click());
    await page.waitForFunction(() => typeof gameStarted !== 'undefined' && gameStarted && !document.getElementById('shipSelect').classList.contains('open'), null, { timeout:30000 });
    await page.waitForTimeout(500);
  },
  /* embarquement direct (captures) : écran-titre puis vaisseau, sans le dialogue de sélection */
  async quickBoard(page, id, opts){
    await page.waitForFunction(() => typeof SHIPGEN !== 'undefined' && document.getElementById('boot'), null, { timeout:60000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('boot').dispatchEvent(new Event('click')));
    await page.waitForFunction(() => document.getElementById('titleScreen').style.display === 'flex', null, { timeout:30000 });
    await page.evaluate(([id, o]) => window.__sttQuickStart(id, o), [id, opts || {}]);
    await page.waitForFunction(() => gameStarted, null, { timeout:30000 });
    await page.waitForTimeout(500);
  },
  /* place le vaisseau à l'abscisse curviligne s de la route, cap tangent */
  async placeOnRoute(page, s){
    await page.evaluate(s => {
      s = Math.max(0, Math.min(ROUTE.length, s));          /* hors de la route, la courbe n'est pas définie */
      const u = s/ROUTE.length;
      shipRig.position.copy(ROUTE.curve.getPointAt(u));
      shipRig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), ROUTE.curve.getTangentAt(u));
      ROUTE.s = s;
    }, s);
  },
  /* temps de jeu accéléré sans rendu (pas de 0,1 s), puis retour au temps réel */
  async fastForward(page, seconds){
    await page.evaluate(() => {
      window.__rr = renderer.render; renderer.render = function(){};
      window.__ffT = 0; clock.getDelta = function(){ window.__ffT += 0.1; return 0.1; };
    });
    await page.waitForFunction(s => window.__ffT >= s, seconds, { timeout:Math.max(30000, seconds*4000) });
    await page.evaluate(() => { renderer.render = window.__rr; delete clock.getDelta; });
  },
  /* temps figé (dt = 0) pendant une capture, rendu actif */
  async freeze(page){ await page.evaluate(() => { clock.getDelta = function(){ return 0; }; }); await page.waitForTimeout(700); },
  async unfreeze(page){ await page.evaluate(() => { delete clock.getDelta; }); }
};

/* ---------------------------------------------------------------- exécuteur */
async function runSuite({ root, page:pageFile, only }){
  const dir = path.dirname(pageFile), file = path.basename(pageFile);
  const srv = await serve(dir), port = srv.address().port;
  const url = (q) => `http://127.0.0.1:${port}/${file}?seed=${(q && q.seed) || 'TEST-SEED-42'}`;
  const browser = await launch();
  const tests = fs.readdirSync(path.join(root, 'src/test')).filter(f => f.endsWith('.test.js')).sort()
    .filter(f => !only || f.includes(only));
  console.log('\u203a tests sur ' + path.relative(root, pageFile) + ' (' + tests.length + ')');
  let failed = 0;
  for(const f of tests){
    const t = require(path.join(root, 'src/test', f)), t0 = Date.now(), errors = [], pages = [];
    const newPage = async (opts) => {
      const ctx = await browser.newContext(Object.assign({ viewport:{ width:1280, height:720 } }, opts || {}));
      const p = await ctx.newPage(); await isolate(p);
      p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(120000);   /* page de 6,8 Mo, rendu logiciel */
      p.on('pageerror', e => errors.push(e.message)); pages.push(ctx);
      return p;
    };
    try{
      await Promise.race([
        t.run({ newPage, url, assert, game }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé (' + (t.timeout || 240) + ' s)')), (t.timeout || 240)*1000))
      ]);
      if(errors.length) throw new Error('erreur(s) JavaScript dans la page : ' + errors.join(' | '));
      console.log('  \u2713 ' + t.name + ' (' + ((Date.now() - t0)/1000).toFixed(1) + ' s)');
    }catch(e){
      failed++; console.log('  \u2717 ' + t.name + ' — ' + e.message);
    }finally{
      for(const c of pages) await c.close().catch(() => {});
    }
  }
  await browser.close(); srv.close();
  console.log(failed ? '\u2717 ' + failed + ' test(s) en échec sur ' + tests.length : '\u2713 ' + tests.length + ' tests réussis');
  return failed === 0;
}

module.exports = { launch, serve, isolate, game, runSuite };
