const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const [seed, ...pairs] = process.argv.slice(2);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:960,height:540}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,400), e.stack && e.stack.split('\n').slice(0,4).join(' | ')));
 p.on('console',m=>{ const t=m.text(); if((m.type()==='error'||m.type()==='warning') && !/ERR_FAILED/.test(t)) console.log('C',t.slice(0,600)); if(t.startsWith('[cine]')) console.log(t); });
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed='+seed+(process.env.QS||''));
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'),{timeout:180000});
 await p.evaluate(()=>{ document.getElementById('sttStart').style.display='none'; document.getElementById('sttTitle').style.opacity=1; });
 if(process.env.INFO) console.log(JSON.stringify(await p.evaluate(()=>({scale:__CINE.scale(), tim:__CINE.timings()})),null,0));
 for(const pr of pairs){ const [tt, kind, adv] = pr.split(':');
   const r = await p.evaluate(([tt,kind,adv])=>{ let x=__CINE.time(); while(x < tt){ __CINE.step(0.1,true); x+=0.1; }
     let ty = kind === 'keep' ? 'keep' : (kind.startsWith('v_') ? __CINE.forceVista(kind.slice(2), 9) : (__CINE.forceShot(kind.split('@')[0], kind.split('@')[1]), kind));
     for(let i=0;i<(+adv||0)*10;i++) __CINE.step(0.1,true); const o = __CINE.step(0.01,false);
     const c=__CINE.caption(); const e=document.getElementById('sttCap'); e.querySelector('.ship').style.display = c.vista?'none':'';
     if(!c.vista){ e.querySelector('.ty').textContent=c.type; e.querySelector('.nm').textContent=c.name; }
     e.querySelector('.loc').textContent=c.star+' . '+c.cls+(c.vista?(c.place?' . '+c.place:''):' . '+c.planet); e.querySelector('.tl').textContent = c.tl ? '⏱ '+c.tl : ''; e.style.transition='none'; e.style.opacity=1;
     return ty+' | '+o.shot+' seg='+o.seg+' k='+Math.round(o.k)+' | '+e.innerText+' | '+JSON.stringify(__CINE.debug()); },[+tt,kind,adv||0]);
   await p.screenshot({path:`r_${tt}_${kind}.jpg`,type:'jpeg',quality:88}); console.log(pr, r);
 }
 await b.close();
})();
