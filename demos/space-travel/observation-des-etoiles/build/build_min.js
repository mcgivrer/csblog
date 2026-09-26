// Construit la version minifiée : scripts de la démo passés à terser, commentaires HTML retirés, CSS compacté
const fs = require('fs'), path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const R = path.join(__dirname, '..'), P = (...a) => path.join(R, ...a);
(async()=>{
  const game = fs.readFileSync(P('engine', 'game.html'), 'utf8');
  const guard = fs.readFileSync(P('src', 'head_guard2.js'),'utf8');
  const main = ['planets.js','asteroids.js','stars.js','shipdrive.js','shipglass.js','shipwear.js','cine.js'].map(f => fs.readFileSync(P('src', f),'utf8')).join('\n');
  const live = fs.readFileSync(P('src', 'live2.js'),'utf8');
  const opt = { compress: { passes: 2 }, mangle: true, format: { comments: false } };
  const mg = (await minify(guard, opt)).code, mm = (await minify(main, opt)).code, ml = (await minify(live, opt)).code;
  let s = game.replace('<title>Voyage spatial — Navigation quantique</title>','<title>Space Travel & Transport — Observation des étoiles</title>');
  // commentaire de licence conservé, commentaire de build retiré ; CSS du jeu recompacté
  s = s.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => '<style>' + new CleanCSS({ level: 1 }).minify(css).styles + '</style>');
  s = s.replace(/\n\s*\n/g, '\n');
  const i = s.indexOf('<script>'); s = s.slice(0, i) + '<script>' + mg + '</script>' + s.slice(i);
  const j = s.lastIndexOf('</body>'); s = s.slice(0, j) + '<script>' + mm + '</script><script>' + ml + '</script>' + s.slice(j);
  fs.mkdirSync(P('dist'), { recursive: true }); fs.writeFileSync(P('dist', 'observation-des-etoiles.min.html'), s);
  console.log('min', s.length, 'demo js', guard.length + main.length + live.length, '->', mg.length + mm.length + ml.length);
})();
