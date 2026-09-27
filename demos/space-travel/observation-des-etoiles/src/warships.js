/* =====================================================================
   FLOTTE MILITAIRE (lot 8, v7.4) — générateur procédural, sur la base des petits engins (smallcraft.js)
   Langage visuel « hard SF » (coques à facettes, blindage rapporté, radiateurs à canaux de chaleur, tourelles) ;
   silhouettes originales. Coques sombres (gris acier, bleu marine, vert olive), feux rouges, projecteurs de coque,
   hublots en fente blindée, intérieurs industriels. Unités : mètres ; nez vers −Z, dos vers +Y.
   Types : 'fighter' (chasseur ≈ 15 m), 'corvette' (≈ 80 m), 'destroyer' (≈ 250 m).
   Les tourelles sont des groupes à part (lacet, puis tangage des canons) : la démo les anime.
   ===================================================================== */
(function(){
'use strict';
if(!window.__CRAFT || !__CRAFT.H) return;
const CR = __CRAFT, H = CR.H, V3 = THREE.Vector3;
CR.MIL = { fighter: { mid: 0x2f3338, accent: 0xff2a1a }, corvette: { mid: 0x30353b, accent: 0xff2a1a }, destroyer: { mid: 0x2d3137, accent: 0xff2a1a } };
const PAINTS = [0x4a5058, 0x2f3b4d, 0x3a4034];                   // gris acier, bleu marine, vert olive sombre

/* tourelle : socle + tête (lacet autour de +Y local) et canons jumelés (tangage) ; ventrale : montée tête en bas */
function turret(G, M, x, y, z, s, ventral, main){
  const yaw = new THREE.Group(); yaw.position.set(x, y, z); if(ventral) yaw.rotation.z = Math.PI; G.add(yaw);
  H.cyl(yaw, 1.1*s, 1.3*s, .6*s, 12, M.dark, 0, .3*s, 0);
  if(main) H.prism(yaw, 2.0*s, 1.0*s, 2.6*s, 1.25*s, 3.0*s, .22, M.paint, 0, 1.15*s, .2*s);
  else H.box(yaw, 1.3*s, .8*s, 1.5*s, M.paint, 0, 1.0*s, 0);
  H.box(yaw, (main ? 2.3 : 1.2)*s, .12*s, .5*s, M.hazard, 0, (main ? 1.8 : 1.42)*s, (main ? 1.1 : .5)*s);
  const pitch = new THREE.Group(); pitch.position.set(0, (main ? 1.15 : 1.0)*s, -(main ? 1.4 : .7)*s); yaw.add(pitch);
  const bl = (main ? 6.5 : 2.8)*s, br = (main ? .24 : .1)*s, sp = (main ? .95 : .42)*s;
  [-1, 1].forEach(k => { H.cyl(pitch, br, br*1.2, bl, 8, M.dark, k*sp/2, 0, -bl/2, Math.PI/2); H.cyl(pitch, br*1.35, br*1.35, .4*s, 8, M.noz, k*sp/2, 0, -bl, Math.PI/2); });
  H.merge(yaw); H.merge(pitch);
  return { yaw, pitch, main, ventral, pos: new V3(x, y, z), s, len: bl };
}
function wing(G, M, s, x, y, z, span, root, tip, sweep, thick){   // aile / pylône plan (xz), côté s
  const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(0, root); f.lineTo(s*span, sweep + tip); f.lineTo(s*span, sweep); f.closePath();
  const g = new THREE.ExtrudeGeometry(f, { depth: thick, bevelEnabled: false }); g.translate(0, 0, -thick/2); g.rotateX(Math.PI/2);
  if(s < 0){ const idx = g.index; if(idx){ const a = idx.array; for(let i = 0; i < a.length; i += 3){ const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } }
  return H.part(G, g, M.paint, x, y, z - root/2);
}

function buildFighter(G, M, o, R){   // chasseur : fuselage en coin, verrière, ailes-pylônes armées, deux tuyères (≈ 15 m)
  const L = 15, w = 3.0, h = 1.5;
  H.prism(G, .7, .45, w, h, 5.5, .22, M.paint, 0, -.05, -L/2 + 2.75, -.12, 0);
  H.prism(G, w, h, w*1.08, h*1.05, 6.0, .24, M.paint, 0, 0, -L/2 + 8.5);
  H.prism(G, w*1.08, h*1.05, w*.86, h*.9, 3.5, .2, M.mid, 0, 0, L/2 - 1.75);
  H.prism(G, .9, .35, 1.25, .75, 3.4, .25, M.dark, 0, h/2 + .2, -L/2 + 5.2, -.1, 0);                // support de verrière
  H.box(G, w*1.1, .07, 5.5, M.accent, 0, -h*.28, -L/2 + 8.5);                                         // liseré rouge
  [-1, 1].forEach(s => {
    wing(G, M, s, s*w*.46, -.12, -.8, 3.4, 5.0, 2.0, 1.4, .16);
    H.cyl(G, .2, .24, 4.6, 8, M.dark, s*(w*.46 + 3.0), -.42, -1.6, Math.PI/2);                      // canon électromagnétique sous l'aile
    H.cyl(G, .09, .09, 1.2, 6, M.noz, s*(w*.46 + 3.0), -.42, -4.4, Math.PI/2);
    H.box(G, .1, .9, 2.6, M.mid, s*w*.42, h*.62, L/2 - 3.0, 0, 0, s*.35);                           // ailette radiateur
    H.box(G, .06, .1, 1.6, M.accent, s*(w*.46 + 3.3), -.1, -.2);                                     // feu de bout d'aile
    H.rcsPod(G, M, o.rcs, s*(w/2 + .1), .2, -L/2 + 3.6, s, 0, .32); H.rcsPod(G, M, o.rcs, s*(w/2 + .05), .2, L/2 - 2.2, s, 0, .32);
  });
  const nz = []; [-1, 1].forEach(s => { H.bell(G, .28, .5, 1.2, M.noz, s*w*.24, 0, L/2); nz.push([s*w*.24, 0, L/2 + 1.2]); });
  const win = [{ kind: 'bridge', C: new V3(0, h/2 + .52, -L/2 + 4.3), T: new V3(-1, 0, 0), N: new V3(0, .8, -.6).normalize(), w: 1.0, h: .4, D: 1.2, floor: .5, lift: .05 }];
  return { len: L, nozzles: nz, nozR: .5, windows: win, lamps: [], navY: -.1, navX: w*.46 + 3.4, navZ: -.2, style: 1, floods: .6, turrets: [] };
}

function buildCorvette(G, M, o, R){   // corvette : proue blindée, coque à facettes, radiateurs ventraux, 2 tourelles, mât de capteurs (≈ 80 m)
  const L = 72, w = 12, h = 10, z0 = -L/2;
  H.prism(G, 3.5, 2.6, w*.92, h*.8, 16, .26, M.paint, 0, -.4, z0 + 8, -.6, 0);
  H.prism(G, w*.92, h*.8, w, h, 30, .28, M.paint, 0, 0, z0 + 31);
  H.prism(G, w, h, w*.86, h*.84, 16, .26, M.mid, 0, 0, z0 + 54);
  const half = z => .5*(w*.92 + w*.08*Math.min(1, Math.max(0, (z - z0 - 16)/30)));
  [-1, 1].forEach(s => { for(let k = 0; k < 4; k++){ const z = z0 + 20 + k*7; H.box(G, .5, h*.16, 6.2, M.dark, s*(half(z) + .1), h*.3, z, 0, s*.05, 0); H.box(G, .5, h*.16, 6.2, M.dark, s*(half(z) + .1), -h*.3, z, 0, s*.05, 0); } });
  [-1, 1].forEach(s => { H.box(G, .35, 5.5, 18, M.dark, s*w*.3, -h/2 - 2.4, z0 + 45, 0, 0, s*.28);
    for(let k = 0; k < 5; k++) H.box(G, .4, .12, 17, M.heat, s*(w*.3 + .02), -h/2 - .8 - k*1.0, z0 + 45, 0, 0, s*.28); });
  H.cyl(G, .35, .45, 5, 8, M.dark, 0, h/2 + 2.4, z0 + 22);
  const dish = new THREE.SphereGeometry(2.2, 16, 6, 0, Math.PI*2, 0, .6); dish.rotateX(-Math.PI/2); H.part(G, dish, M.mid, 0, h/2 + 5.0, z0 + 21);
  H.box(G, w*.9, .3, 3, M.hazard, 0, h/2 + .05, z0 + 33);
  H.greeble(G, M, R, 40, -w*.32, w*.32, h/2, z0 + 24, z0 + 60);
  const tur = [turret(G, M, 0, h/2, z0 + 28, 1.3, false, false), turret(G, M, 0, -h/2, z0 + 50, 1.3, true, false)];
  const nz = []; H.bell(G, 2.0, 4.0, 7.5, M.noz, 0, 0, z0 + 62); nz.push([0, 0, z0 + 69.5]);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => H.bell(G, .6, 1.1, 2.5, M.noz, c[0]*w*.36, c[1]*h*.34, z0 + 62));
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach((c, i) => H.rcsPod(G, M, o.rcs, c[0]*(w/2 + .3), c[1]*h*.18, i < 2 ? z0 + 12 : z0 + 58, c[0], 0, .9));
  H.rcsPod(G, M, o.rcs, 0, h/2 + .4, z0 + 12, 0, 1, .9); H.rcsPod(G, M, o.rcs, 0, -h/2 - .4, z0 + 60, 0, -1, .9);
  [-1, 1].forEach(s => H.box(G, .06, .25, 26, M.accent, s*(w/2 + .02), 0, z0 + 31));
  const win = [{ kind: 'bridge', C: new V3(0, h/2 + .02, z0 + 17.5), T: new V3(-1, 0, 0), N: new V3(0, 1, -.1).normalize(), w: 5.2, h: .85, D: 3.6, floor: .9 }];
  [-1, 1].forEach(s => { for(let r = 0; r < 2; r++) for(let k = 0; k < 5; k++){ const z = z0 + 21 + k*5 + r*2.2;
    win.push({ kind: 'port', fam: 'slit', C: new V3(s*(half(z) + .02), r ? -1.1 : 1.1, z), T: new V3(0, 0, -s), N: new V3(s, 0, 0), w: 1.4, D: 2.6, room: [-1.5, 1.5, -1.25, 1.1], lift: .03 }); } });
  return { len: L + 8, nozzles: nz, nozR: 4.0, windows: win, lamps: [[0, -h*.3, z0 + 3, new V3(0, -.25, -1)]], navY: h*.3, navX: w/2 + 1.2, navZ: z0 + 22, style: 1, floods: 1, turrets: tur };
}

function buildDestroyer(G, M, o, R){   // destroyer : proue en marteau et canon axial, épine, 3 modules blindés, grands radiateurs, 6 tourelles (≈ 250 m)
  const L = 236, w = 34, h = 24, z0 = -L/2;
  H.prism(G, w*.7, h*.45, w*1.02, h*.72, 26, .24, M.paint, 0, 0, z0 + 13, -1.0, 0);
  H.cyl(G, 2.2, 2.6, 14, 12, M.dark, 0, -1.5, z0 - 5, Math.PI/2); H.cyl(G, 3.0, 3.0, 1.4, 12, M.noz, 0, -1.5, z0 - 11.6, Math.PI/2);
  H.prism(G, w*.42, h*.42, w*.42, h*.42, 150, .3, M.mid, 0, 0, z0 + 101);
  for(let k = 0; k < 12; k++) H.box(G, w*.48, h*.48, 1.2, M.dark, 0, 0, z0 + 32 + k*12);
  const mods = [[z0 + 40, 40, .92, .76], [z0 + 88, 44, 1.0, .9], [z0 + 138, 36, .88, .8]], wins = [];
  mods.forEach(([zc, len, sw, sh], i) => {
    H.prism(G, w*sw*.94, h*sh*.9, w*sw, h*sh, len, .26, M.paint, 0, 0, zc);
    const hw = w*sw/2;
    [-1, 1].forEach(s => { for(let k = 0; k < Math.floor(len/9); k++) H.box(G, .8, h*sh*.14, 7.6, M.dark, s*(hw + .3), h*sh*.3, zc - len/2 + 4.5 + k*9, 0, s*.05, 0);
      H.box(G, .08, .5, len*.8, M.accent, s*(hw + .05), -h*sh*.26, zc);
      if(i < 2) for(let r = 0; r < 2; r++) for(let k = 0; k < 7; k++){ const z = zc - len*.38 + k*len*.76/6; if(i === 1 && Math.abs(z - (z0 + 92)) < 10.5) continue;   // hangars
        wins.push({ kind: 'port', fam: 'slit', C: new V3(s*(hw*.97 + .02), (r ? -1.6 : 1.6), z), T: new V3(0, 0, -s), N: new V3(s, 0, 0), w: 1.8, D: 3.0, room: [-1.8, 1.8, -1.25, 1.15], lift: .03 }); } });
    H.greeble(G, M, R, 70, -hw*.7, hw*.7, h*sh/2, zc - len/2 + 3, zc + len/2 - 3);
  });
  [-1, 1].forEach(s => { const zr = z0 + 156;
    H.box(G, 30, 1.0, 44, M.dark, s*(w*.5 + 16), 0, zr, 0, 0, s*.12);
    for(let k = 0; k < 9; k++) H.box(G, 28, 1.1, .5, M.heat, s*(w*.5 + 16), 0, zr - 20 + k*5, 0, 0, s*.12);
    H.box(G, 4, 4, 40, M.mid, s*(w*.25 + 2), 0, zr); });
  H.prism(G, w*.8, h*.8, w*.7, h*.7, 36, .26, M.mid, 0, 0, z0 + 190);
  const nz = []; [[0, 5], [-8, -4], [8, -4]].forEach(c => { H.bell(G, 4.5, 8.0, 15, M.noz, c[0], c[1], z0 + 208); nz.push([c[0], c[1], z0 + 223]); });
  H.cyl(G, .8, 1.0, 12, 8, M.dark, 0, h*.38 + 6, z0 + 64);
  const dish = new THREE.SphereGeometry(4.5, 18, 6, 0, Math.PI*2, 0, .6); dish.rotateX(-Math.PI/2); H.part(G, dish, M.mid, 0, h*.38 + 12, z0 + 62);
  H.box(G, w*.8, .5, 6, M.hazard, 0, h*.45 + .1, z0 + 112);
  const tur = [turret(G, M, 0, h*.38, z0 + 30, 3.2, false, true), turret(G, M, 0, h*.45, z0 + 80, 3.2, false, true),
    turret(G, M, -w*.34, h*.38, z0 + 50, 1.4, false, false), turret(G, M, w*.34, h*.38, z0 + 50, 1.4, false, false),
    turret(G, M, -w*.3, -h*.45, z0 + 100, 1.4, true, false), turret(G, M, w*.3, -h*.45, z0 + 100, 1.4, true, false)];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach((c, i) => { H.rcsPod(G, M, o.rcs, c[0]*(w*.52 + .8), c[1]*h*.2, z0 + 22, c[0], 0, 2.4); H.rcsPod(G, M, o.rcs, c[0]*(w*.45 + .8), c[1]*h*.2, z0 + 180, c[0], 0, 2.4); });
  H.rcsPod(G, M, o.rcs, 0, h*.4 + 1, z0 + 8, 0, 1, 2.4); H.rcsPod(G, M, o.rcs, 0, -h*.4 - 1, z0 + 186, 0, -1, 2.4);
  const win = [{ kind: 'bridge', C: new V3(0, h*.36 + .05, z0 + 18), T: new V3(-1, 0, 0), N: new V3(0, 1, -.22).normalize(), w: 10, h: 1.4, D: 5.0, floor: 1.0 }].concat(wins);
  // v7.5 : deux hangars latéraux à champ de force (module central), un chasseur dans chacun
  const bays = [-1, 1].map(s => ({ C: new V3(s*(w/2 + .03), -1.0, z0 + 92), T: new V3(0, 0, -s), N: new V3(s, 0, 0), w: 16, h: 7, D: 24, fw: .6 }));
  [-1, 1].forEach(s => { H.box(G, .3, .5, 18, M.hazard, s*(w/2 + .1), 3.2, z0 + 92); H.box(G, .3, .5, 18, M.hazard, s*(w/2 + .1), -5.2, z0 + 92); });
  return { len: L + 18, nozzles: nz, nozR: 8.0, windows: win, bays, lamps: [[0, -h*.3, z0 + 2, new V3(0, -.2, -1)]], navY: 0, navX: w*.5 + 31, navZ: z0 + 156, style: 1, floods: 1, turrets: tur };
}

function buildTarget(G, M, o, R){   // drone-cible d'exercice : noyau à bandes de danger, bouclier d'entraînement (les impacts l'illuminent), feu rouge (≈ 5 m)
  H.part(G, new THREE.IcosahedronGeometry(1.6, 0), M.hazard, 0, 0, 0);
  H.cyl(G, 1.9, 1.9, .35, 16, M.accent, 0, 0, 0);
  [-1, 1].forEach(sd => H.box(G, .12, .12, 3.2, M.dark, sd*1.2, 0, .6));
  H.bell(G, .25, .4, .6, M.noz, 0, 0, 1.6);
  const sm = new THREE.ShaderMaterial({ uniforms: { uHit: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'precision highp float; uniform float uHit; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(vec3(0.3, 0.6, 1.0)*(0.05 + 1.6*uHit)*f, 1.0); }' });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(5.5, 24, 16), sm); shield.userData.keep = true; shield.userData.noFrame = true; shield.renderOrder = H.ORDER + 2; G.add(shield);
  o.shield = sm.uniforms.uHit;
  return { len: 5, nozzles: [[0, 0, 2.2]], nozR: .4, windows: [], lamps: [], navY: 1.9, navX: 2.2, navZ: 0, style: 1, turrets: [], extra: { shield: sm.uniforms.uHit } };
}
CR.register('target', buildTarget, [0xd9d9d9], 'Target drone');
CR.MIL.target = { mid: 0x3a3f46, accent: 0xff3020 };
CR.register('fighter', buildFighter, PAINTS, 'Fighter');
CR.register('corvette', buildCorvette, PAINTS, 'Corvette');
CR.register('destroyer', buildDestroyer, PAINTS, 'Destroyer');
/* animation des tourelles : balayage lent (lacet), canons qui se lèvent et s'abaissent ; les tourelles de défense rapprochée plus vives */
CR.aimTurrets = function(c, t, seed){
  (c.turrets || []).forEach((u, i) => { const ph = (seed || 0)*1.7 + i*2.3, sp = u.main ? .12 : .35;
    u.yaw.rotation.y = 1.1*Math.sin(t*sp + ph) + (u.main ? 0 : .5*Math.sin(t*sp*2.7 + ph*1.3));
    u.pitch.rotation.x = (u.main ? .08 : .25) + (u.main ? .06 : .3)*Math.sin(t*sp*1.6 + ph*.7); });
};
})();
