// sélecteur de vaisseaux : ouverture depuis l'accueil et en démo, choix, relais, clavier
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,300))); p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0,300)); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=' + (process.argv[2] || 'OBS-3'));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 // 1) accueil : bouton « CHOOSE A SHIP », flèche droite ×3, Entrée
 await p.click('#sttPick'); await p.waitForTimeout(800);
 const open1 = await p.evaluate(()=>document.getElementById('shipSelect').classList.contains('open'));
 await p.screenshot({path:'sel_0.jpg', type:'jpeg', quality:85, timeout:120000});
 for(let i=0;i<3;i++){ await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); }
 const name1 = await p.evaluate(()=>document.getElementById('ssName').textContent);
 await p.keyboard.press('Enter'); await p.waitForTimeout(400);
 const after1 = await p.evaluate(()=>({ open: document.getElementById('shipSelect').classList.contains('open'), pick: document.getElementById('sttPick').textContent, hero: __CINE.heroInfo() }));
 // 2) lancement, avance, puis touche V pendant l'orbite
 await p.click('#sttStart'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ for(let i=0;i<200;i++) __CINE.step(0.1, true); });
 await p.keyboard.press('v'); await p.waitForTimeout(700);
 const open2 = await p.evaluate(()=>document.getElementById('shipSelect').classList.contains('open'));
 await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(250);
 const name2 = await p.evaluate(()=>document.getElementById('ssName').textContent);
 await p.keyboard.press('Enter'); await p.waitForTimeout(500);
 const after2 = await p.evaluate(()=>{ __CINE.step(0.01, true); return 0; }).then(()=>p.evaluate(()=>({ T: __CINE.time().toFixed(1), toast: document.getElementById('sttToast').textContent, hero: __CINE.heroInfo(), cap: __CINE.caption().type + ' / ' + __CINE.caption().name, t: __CINE.timings() })));
 await p.evaluate(()=>{ __CINE.step(0.2, false); });
 await p.screenshot({path:'sel_1.jpg', type:'jpeg', quality:85, timeout:120000});
 // 3) Échap annule ; L bascule Suivre
 await p.keyboard.press('v'); await p.waitForTimeout(500); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
 const after3 = await p.evaluate(()=>({ open: document.getElementById('shipSelect').classList.contains('open'), hero: __CINE.heroInfo() }));
 await p.keyboard.press('l'); await p.waitForTimeout(200);
 const after4 = await p.evaluate(()=>({ follow: __CINE.followHero, btn: document.getElementById('sttLockBtn').textContent }));
 // 4) la démo continue : 60 s simulées, le héros choisi part et arrive au système suivant
 const run = await p.evaluate(()=>{ const out = []; for(let k=0;k<6;k++){ for(let i=0;i<100;i++) __CINE.step(0.1, true); out.push(__CINE.caption().type + ':' + (__CINE.visit().hero.type)); } return out; });
 console.log(JSON.stringify({ open1, name1, after1, open2, name2, after2, after3, after4, run, errs: errs.slice(0,5) }, null, 1));
 await b.close();
})();
