// inventaire des textures des vaisseaux et petits engins : taille, répétition, anisotropie, texels par mètre
const { chromium } = require('playwright');
const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await p.route(/fonts\.g/, r=>r.abort());
 await p.goto(ROOT + 'dist/observation-des-etoiles.html?seed=OBS-1&music=0');
 await p.waitForFunction(()=>document.querySelector('#sttStart.ready'), null, {timeout:180000, polling:250});
 const out = await p.evaluate(()=>{
   const tex = new Map();
   const scan = (group, who) => group.traverse(o => { if(!o.isMesh || !o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
     ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap'].forEach(k => { const t = m[k]; if(!t || !t.image) return;
       const key = t.uuid; let e = tex.get(key); const img = t.image;
       if(!e){ e = { w: img.width, h: img.height, slots: new Set(), who: new Set(), rep: t.repeat.x.toFixed(2) + 'x' + t.repeat.y.toFixed(2), aniso: t.anisotropy, mag: t.magFilter, min: t.minFilter, meshes: 0, tpm: [] }; tex.set(key, e); }
       e.slots.add(k); e.who.add(who); e.meshes++;
       // texels par mètre : taille du maillage / répétition des UV
       const g = o.geometry; if(g && g.attributes.uv && e.tpm.length < 4){ g.computeBoundingBox(); const bb = g.boundingBox, sz = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
         const uv = g.attributes.uv.array; let u0 = 1e9, u1 = -1e9; for(let i = 0; i < uv.length; i += 2){ u0 = Math.min(u0, uv[i]); u1 = Math.max(u1, uv[i]); }
         const s = o.getWorldScale(new THREE.Vector3()).x; if(sz > 0) e.tpm.push(+((u1 - u0)*t.repeat.x*img.width/(sz*s)).toFixed(1)); }
     }); }); });
   SHIPGEN.MODELS.forEach(m => { const bb = SHIPGEN.build(m.id, { warp: true, jump: true, age: .5, ageSeed: 7 }); scan(bb.group, m.id); SHIPGEN.dispose(bb.group); });
   ['maint', 'crew', 'drone', 'lighter'].forEach(k => { const c = __CRAFT.build(k, { age: .5, seed: 3 }); scan(c.group, 'craft:' + k); c.dispose && c.dispose(); });
   return { maxAniso: renderer.capabilities.getMaxAnisotropy(), textures: [...tex.values()].map(e => ({ size: e.w + 'x' + e.h, slots: [...e.slots].join(','), rep: e.rep, aniso: e.aniso, meshes: e.meshes, who: [...e.who].slice(0, 6).join(' '), texelsPerMeter: e.tpm })) };
 });
 console.log(JSON.stringify(out, null, 1));
 await b.close();
})();
