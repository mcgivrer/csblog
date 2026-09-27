// Version obfusquée : commentaires retirés, JS compressé et renommé (terser), CSS/HTML minifiés.
// three.js (déjà minifié, licence MIT conservée) n'est pas repassé dans terser.
const fs = require('fs');
const { minify: htmlMin } = require('html-minifier-terser');
const { minify: jsMin } = require('terser');
(async () => {
  const [,, input, output] = process.argv;
  let html = fs.readFileSync(input, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const game = blocks[blocks.length - 1];
  const js = await jsMin(game[1], { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  html = html.slice(0, game.index) + '<script>' + js.code + '</script>' + html.slice(game.index + game[0].length);
  html = await htmlMin(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true,
                               minifyCSS: true, minifyJS: false, useShortDoctype: true });
  fs.writeFileSync(output, html);
  const a = Buffer.byteLength(fs.readFileSync(input)), b = Buffer.byteLength(html);
  console.log(`  ${input} ${(a/1024).toFixed(0)} Ko -> ${output} ${(b/1024).toFixed(0)} Ko (-${(100*(1-b/a)).toFixed(0)} %)`);
})().catch(e => { console.error(e); process.exit(1); });
