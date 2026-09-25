#!/usr/bin/env node
/* =============================================================================
   Space Travel & Transport — build, tests, documentation et packaging
   -----------------------------------------------------------------------------
   Usage :  node build.js <commande> [options]      (ou : npm run <commande>)

     build     assemble src/ en une page unique :
                 target/dev/space-travel.html      lisible (three.js intégré,
                                                   musique à côté, pour déboguer)
                 target/space-travel.min.html      compacte et obfusquée, TOUT
                                                   intégré (three.js, musique)
                 target/space-travel.min.html.gz   la même, compressée (gzip -9)
     test      exécute src/test/*.test.js sur target/space-travel.min.html
                 --dev         teste la version lisible à la place
                 --only=<mot>  ne lance que les tests dont le nom contient <mot>
     captures  régénère les captures d'écran de la spécification
                 (src/docs/spec/images) à partir de la version lisible
     docs      PDF de la spécification (FR, EN) et de l'étude → target/docs/
                 (diagrammes Mermaid rendus en graphiques)
     package   archive de livraison target/space-travel-<version>.zip
     all       clean + build + test + docs + package
     clean     vide target/

   Prérequis : Node.js ≥ 18, `npm install`, puis `npx playwright install chromium`
   (tests, captures, PDF). Variable CHROMIUM_PATH : navigateur à utiliser à la
   place de celui de Playwright.
   ============================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ROOT = __dirname;
const P = {
  html: path.join(ROOT, 'src/html/index.html'), css: path.join(ROOT, 'src/css'), js: path.join(ROOT, 'src/js'),
  assets: path.join(ROOT, 'src/assets'), docs: path.join(ROOT, 'src/docs'), test: path.join(ROOT, 'src/test'),
  target: path.join(ROOT, 'target')
};
const PKG = require('./package.json');
const MUSIC = 'musics/observation-des-etoiles_by_scorestudio_from_envato.m4a';
const THREE_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';

const log = (...a) => console.log('\u203a', ...a);
const rel = f => path.relative(ROOT, f);
const size = f => (fs.statSync(f).size/1024).toFixed(0) + ' Ko';
const arg = (name) => { const a = process.argv.find(x => x.startsWith('--' + name)); return a ? (a.split('=')[1] || true) : null; };
const mkdir = d => fs.mkdirSync(d, { recursive:true });

/* ---------------------------------------------------------------- assemblage */
function concatDir(dir, ext){
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
}
function assemble(){
  const tpl = fs.readFileSync(P.html, 'utf8');
  for(const m of ['/*@inline:css*/', '/*@inline:js*/']) if(!tpl.includes(m)) throw new Error('src/html/index.html : marqueur ' + m + ' absent');
  if(!tpl.includes(THREE_TAG)) throw new Error('src/html/index.html : balise three.js r128 introuvable');
  return tpl.replace('/*@inline:css*/', () => concatDir(P.css, '.css')).replace('/*@inline:js*/', () => concatDir(P.js, '.js'));
}
function inlineThree(html){
  const three = fs.readFileSync(require.resolve('three/build/three.min.js'), 'utf8');
  if(three.includes('</script')) throw new Error('three.min.js contient « </script » : intégration impossible');
  return html.replace(THREE_TAG, () => '<script>' + three + '</script>');
}
function inlineMusic(html){
  const f = path.join(P.assets, MUSIC);
  if(!html.includes(MUSIC)) throw new Error('chemin de la musique introuvable dans le code');
  const uri = 'data:audio/mp4;base64,' + fs.readFileSync(f).toString('base64');
  return html.split(MUSIC).join(uri);
}

/* ------------------------------------------ compactage / obfuscation (JS, CSS, HTML)
   Même comportement que l'ancien minify-html-bundle.py : licence de tête conservée,
   commentaires HTML retirés, CSS minifié (clean-css niveau 2), JS minifié et
   identifiants locaux raccourcis (terser — les globales restent intactes, le code
   étant un script classique partagé). */
async function minifyPage(html){
  const CleanCSS = require('clean-css'), { minify } = require('terser');
  const lic = html.match(/<!--[\s\S]*?-->/);
  if(!lic) throw new Error('commentaire de licence attendu en tête de page');
  const s0 = html.indexOf('<style>'), s1 = html.indexOf('</style>', s0);
  const j0 = html.lastIndexOf('<script>'), j1 = html.indexOf('</script>', j0);
  const css = new CleanCSS({ level:2 }).minify(html.slice(s0 + 7, s1));
  if(css.errors.length) throw new Error('CSS : ' + css.errors.join(' ; '));
  const js = await minify(html.slice(j0 + 8, j1), { compress:{ drop_console:false }, mangle:true });
  const strip = t => t.replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n');
  const note = '\n  Build compact et obfusqué (node build.js) — commentaires retirés, identifiants raccourcis.\n  Sources lisibles : dossier src/ du projet.\n';
  const head = html.slice(0, lic.index) + lic[0].replace(/-->$/, note + '-->');
  return head + strip(html.slice(lic.index + lic[0].length, s0)) + '<style>' + css.styles + '</style>'
       + strip(html.slice(s1 + 8, j0)) + '<script>' + js.code + '</script>' + strip(html.slice(j1 + 9));
}

async function build(){
  const t0 = Date.now();
  mkdir(path.join(P.target, 'dev/musics'));
  const html = assemble();
  const dev = path.join(P.target, 'dev/space-travel.html');
  fs.writeFileSync(dev, inlineThree(html));
  fs.copyFileSync(path.join(P.assets, MUSIC), path.join(P.target, 'dev', MUSIC));
  const min = await minifyPage(html);
  if((min.match(/three\.min\.js/g) || []).length > 1) throw new Error('balise three.js dupliquée dans la version compacte');
  const out = path.join(P.target, 'space-travel.min.html');
  fs.writeFileSync(out, inlineMusic(inlineThree(min)));
  fs.writeFileSync(out + '.gz', zlib.gzipSync(fs.readFileSync(out), { level:9 }));
  log('build', PKG.version, '(' + ((Date.now() - t0)/1000).toFixed(1) + ' s)');
  log('  ' + rel(dev), size(dev));
  log('  ' + rel(out), size(out), '— compressée :', size(out + '.gz'));
}

/* ------------------------------------------------------------------- tests */
async function test(){
  const page = path.join(P.target, arg('dev') ? 'dev/space-travel.html' : 'space-travel.min.html');
  if(!fs.existsSync(page)) await build();
  const { runSuite } = require('./src/test/lib/harness.js');
  const ok = await runSuite({ root:ROOT, page, only:arg('only') });
  if(!ok) process.exitCode = 1;
  return ok;
}
async function captures(){
  const page = path.join(P.target, 'dev/space-travel.html');
  if(!fs.existsSync(page)) await build();
  await require('./src/test/captures.js').run({ root:ROOT, page, out:path.join(P.docs, 'spec/images'), demos:path.join(P.docs, 'demos') });
}

/* ------------------------------------------------------------ documentation */
function slug(v){      /* ancres compatibles avec les liens du sommaire des documents */
  return v.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-').replace(/-{3,}/g, '--');
}
const DOC_CSS = `@page { size:A4; margin:18mm 16mm 20mm 16mm; } @page paysage { size:A4 landscape; margin:14mm 14mm 16mm 14mm; }
html{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body{ font:10.2pt/1.6 Inter, "DejaVu Sans", Arial, sans-serif; color:#121826; margin:0; }
h1,h2,h3,h4{ font-family:"JetBrains Mono","DejaVu Sans Mono",monospace; break-after:avoid; }
h1{ font-size:20pt; border-bottom:2.5pt solid #FFB454; padding-bottom:8pt; margin:0 0 8pt; }
h2{ font-size:14pt; margin:20pt 0 8pt; padding-top:6pt; border-top:0.75pt solid #D8DEE9; }
h3{ font-size:11.3pt; margin:14pt 0 6pt; color:#92400E; } h4{ font-size:10.3pt; color:#0F766E; }
p{ margin:0 0 7pt; } a{ color:#0F766E; text-decoration:none; } em{ color:#46536B; }
ul,ol{ margin:0 0 8pt 16pt; padding:0; } li{ margin:2pt 0; }
img{ max-width:100%; display:block; margin:8pt auto 4pt; break-inside:avoid; border:0.75pt solid #D8DEE9; }
table{ border-collapse:collapse; width:100%; margin:6pt 0 10pt; font-size:8.8pt; line-height:1.4; }
th{ background:#F6F7FB; font-family:"JetBrains Mono","DejaVu Sans Mono",monospace; text-align:left; }
th,td{ border:0.75pt solid #D8DEE9; padding:4pt 6pt; vertical-align:top; } tr{ break-inside:avoid; }
code{ font-family:"JetBrains Mono","DejaVu Sans Mono",monospace; font-size:8.6pt; background:#F6F7FB; padding:0 2pt; }
pre{ background:#F6F7FB; padding:7pt 9pt; font-size:7.6pt; line-height:1.45; white-space:pre-wrap; break-inside:avoid; } pre code{ background:none; padding:0; }
.mermaid{ display:block; text-align:center; margin:8pt 0 12pt; break-inside:avoid; }
.mermaid svg{ max-width:100% !important; max-height:880px; height:auto; }
.mermaid.paysage{ page:paysage; margin:0; } .mermaid.paysage svg{ max-height:620px; }`;
/* Mermaid dans le navigateur, avant impression : un organigramme réduit sous 62 %
   sur A4 portrait est redessiné dans l'orientation inverse s'il y gagne ; encore
   sous 45 %, il reçoit une page paysage dédiée. Les sources ne changent pas. */
const MERMAID_RUN = `(async function(){ try{
  mermaid.initialize({ startOnLoad:false, theme:'neutral', securityLevel:'loose', fontFamily:'"DejaVu Sans", Arial, sans-serif',
    flowchart:{ htmlLabels:true, useMaxWidth:true, curve:'basis' }, sequence:{ useMaxWidth:true }, stateDiagram:{ useMaxWidth:true } });
  const els = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
  els.forEach(el => { el.dataset.src = el.textContent; });
  if(els.length) await mermaid.run({ nodes:els });
  const fit = (el, W, H) => { const svg = el.querySelector('svg'); if(!svg) return 1; const vb = svg.viewBox.baseVal; return Math.min(1, W/vb.width, H/vb.height); };
  for(const el of els){
    const src = el.dataset.src, k0 = fit(el, 670, 880); let k = k0;
    const m = /^\\s*flowchart\\s+(LR|TD|TB)/.exec(src);
    if(k0 < 0.62 && m){
      el.removeAttribute('data-processed'); el.innerHTML = ''; el.textContent = src.replace(/flowchart\\s+(LR|TD|TB)/, m[1] === 'LR' ? 'flowchart TD' : 'flowchart LR');
      await mermaid.run({ nodes:[el] });
      if(fit(el, 670, 880) > k0) k = fit(el, 670, 880);
      else { el.removeAttribute('data-processed'); el.innerHTML = ''; el.textContent = src; await mermaid.run({ nodes:[el] }); }
    }
    if(k < 0.45) el.classList.add('paysage');
  }
  window.__mm = 'ok';
}catch(e){ window.__mm = 'erreur : ' + (e && e.message); } })();`;

async function docs(){
  const { marked } = require('marked');
  const { launch } = require('./src/test/lib/harness.js');
  const mermaidJs = require.resolve('mermaid/dist/mermaid.min.js');
  const outDir = path.join(P.target, 'docs'); mkdir(outDir);
  const v = PKG.version.split('.').slice(0, 2).join('.');
  const list = [
    { src:'spec/spec.fr.md', out:`spec-space_travel_and_transport-${v}.pdf`, lang:'fr', title:`Space Travel &amp; Transport — Spécification v${v}` },
    { src:'spec/spec.en.md', out:`spec-space_travel_and_transport-${v}_en.pdf`, lang:'en', title:`Space Travel &amp; Transport — Specification v${v}` },
    { src:'etude/etude-vaisseaux-generatifs.md', out:'etude-vaisseaux-generatifs.pdf', lang:'fr', title:'Étude — Construction générative des vaisseaux cargo' }
  ];
  const browser = await launch();
  try{
    for(const d of list){
      const file = path.join(P.docs, d.src), dir = path.dirname(file), md = fs.readFileSync(file, 'utf8');
      const renderer = new marked.Renderer();
      renderer.heading = (text, level, raw) => `<h${level} id="${slug(raw)}">${text}</h${level}>`;
      renderer.code = (code, lang) => lang === 'mermaid'
        ? `<div class="mermaid">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
        : `<pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`;
      const body = marked.parse(md, { renderer });
      const ids = new Set([...body.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
      const broken = [...md.matchAll(/\]\(#([^)]+)\)/g)].map(m => m[1]).filter(a => !ids.has(a));
      if(broken.length) throw new Error(d.src + ' : liens internes cassés → ' + broken.join(', '));
      const html = `<!DOCTYPE html><html lang="${d.lang}"><head><meta charset="utf-8"><base href="file://${dir}/"><style>${DOC_CSS}</style></head>`
                 + `<body>${body}<script src="file://${mermaidJs}"></script><script>${MERMAID_RUN}</script></body></html>`;
      const tmp = path.join(outDir, '.' + path.basename(d.out, '.pdf') + '.html'); fs.writeFileSync(tmp, html);
      const page = await browser.newPage();
      await page.goto('file://' + tmp, { waitUntil:'load' });
      await page.waitForFunction(() => window.__mm !== undefined, null, { timeout:120000 });
      const state = await page.evaluate(() => window.__mm);
      if(state !== 'ok') throw new Error(d.src + ' : Mermaid — ' + state);
      await page.pdf({ path:path.join(outDir, d.out), format:'A4', preferCSSPageSize:true, printBackground:true, displayHeaderFooter:true,
        headerTemplate:'<span></span>', margin:{ top:'18mm', bottom:'20mm', left:'16mm', right:'16mm' },
        footerTemplate:`<div style="width:100%;font:8px monospace;color:#6B7690;padding:0 16mm;display:flex;justify-content:space-between"><span>${d.title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
      await page.close(); fs.unlinkSync(tmp);
      log('  target/docs/' + d.out, size(path.join(outDir, d.out)));
    }
  } finally { await browser.close(); }
}

/* --------------------------------------------------------------- packaging */
async function pack(){
  const AdmZip = require('adm-zip');
  const min = path.join(P.target, 'space-travel.min.html');
  if(!fs.existsSync(min)) await build();
  const zip = new AdmZip();
  zip.addLocalFile(min); zip.addLocalFile(min + '.gz');
  const d = path.join(P.target, 'docs');
  if(fs.existsSync(d)) for(const f of fs.readdirSync(d).filter(f => f.endsWith('.pdf'))) zip.addLocalFile(path.join(d, f), 'docs');
  zip.addLocalFile(path.join(ROOT, 'README.md'));
  const out = path.join(P.target, `space-travel-${PKG.version}.zip`);
  zip.writeZip(out);
  log('package', rel(out), size(out));
}

function clean(){ fs.rmSync(P.target, { recursive:true, force:true }); log('clean', rel(P.target)); }
async function all(){ clean(); await build(); if(!(await test())) throw new Error('tests en échec : packaging annulé'); await docs(); await pack(); }

const COMMANDS = { build, test, captures, docs, package:pack, clean, all };
const cmd = process.argv[2] || 'build';
if(!COMMANDS[cmd]){ console.error('commande inconnue : ' + cmd + ' (build | test | captures | docs | package | all | clean)'); process.exit(2); }
Promise.resolve(COMMANDS[cmd]()).catch(e => { console.error('\u2717', e.message); process.exit(1); });
