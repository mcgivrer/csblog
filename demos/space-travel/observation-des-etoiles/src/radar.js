/* =====================================================================
   RADAR (lot 2, v6.8) — touche R
   Cercle en bas à droite, centré sur le vaisseau filmé, nez vers le haut. Vaisseaux et engins proches :
   point (ambre pour le plus proche), immatriculation, et liste nom · immatriculation · distance (u, ku, Mu… : 1 u = 1 m).
   Portée automatique par paliers (300 u → 3 Gu), échelle en racine carrée, contacts hors portée sur le bord,
   repère d'élévation (au-dessus / au-dessous du plan du vaisseau), balayage (coupé si mouvement réduit).
   Données : __CINE.radarState() 10 fois par seconde, dessin ≈ 30 images/s, rien quand il est masqué. Charte McGivrer.
   ===================================================================== */
(function(){
  const C = window.__CINE; if(!C) return;
  const TAU = Math.PI*2, STEPS = [300, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8, 1e9, 3e9];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fmtRange = m => C.fmtU(m).replace(/\.0+ /, ' ');
  const F = (px, w) => (w || '') + ' ' + px + "px 'JetBrains Mono', ui-monospace, monospace";
  const css = document.createElement('style');
  css.textContent =
    "#stmRadar{--rd:196px;position:fixed;right:2.4vw;bottom:6vh;z-index:9;width:var(--rd);pointer-events:none;font-family:'JetBrains Mono',monospace;opacity:0;transition:opacity .5s}" +
    "#stmRadar.on{opacity:1}" +
    "#stmRadar .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:9.5px;letter-spacing:.12em;color:#8ea0c4;margin-bottom:5px;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap}" +
    "#stmRadar .hd b{color:#e8edf5}#stmRadar .hd .rg{color:#5eead4}" +
    "#stmRadar .cv{position:relative;width:var(--rd);height:var(--rd)}" +
    "#stmRadar .cv::before,#stmRadar .cv::after{content:'';position:absolute;width:10px;height:10px;border:1.5px solid #ffb454}" +
    "#stmRadar .cv::before{top:0;left:0;border-right:none;border-bottom:none}#stmRadar .cv::after{bottom:0;right:0;border-left:none;border-top:none}" +
    "#stmRadar canvas{display:block;width:100%;height:100%}" +
    "#stmRadar .ls{margin-top:6px;font-size:10px;line-height:1.6;color:#8ea0c4;text-shadow:0 1px 3px rgba(0,0,0,.95)}" +
    "#stmRadar .ls div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#stmRadar .ls .r{color:#e8edf5;margin-right:6px}#stmRadar .ls .d{color:#5eead4;float:right;margin-left:8px}" +
    "#stmRadar .ls .n1 .r,#stmRadar .ls .n1 .d{color:#ffb454}#stmRadar .ls .out{color:#5d6f92}" +
    "@media (max-width:760px),(max-height:560px){#stmRadar{--rd:124px;bottom:9vh}#stmRadar .ls div:nth-child(n+3){display:none}#stmRadar .hd{font-size:8.5px}}" +
    "@media (max-width:900px){body.rd-on #sttCap{max-width:calc(100vw - 190px)}}" +
    "@media (prefers-reduced-motion: reduce){#stmRadar{transition:none}}";
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'stmRadar'; el.className = 'demo-ui'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="hd"><span><b>RADAR</b> <span class="sj"></span></span><span class="rg"></span></div><div class="cv"><canvas></canvas></div><div class="ls"></div>';
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), sj = el.querySelector('.sj'), rgEl = el.querySelector('.rg'), ls = el.querySelector('.ls');
  const P = new URLSearchParams(location.search);
  const St = { on: P.get('radar') !== '0', vis: false, data: null, tData: 0, tDraw: 0, range: 3e3, want: 3e3, wantT: 0, subj: '', size: 0, dpr: 1, listHtml: '', head: '', costU: 0, nU: 0, costD: 0, nD: 0 };

  function fit(){ const s = el.querySelector('.cv').clientWidth || 196, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if(s !== St.size || dpr !== St.dpr){ St.size = s; St.dpr = dpr; cv.width = Math.round(s*dpr); cv.height = Math.round(s*dpr); } }
  function update(now){
    const t0 = performance.now(), d = C.radarState(); St.data = d; if(!d) return;
    const cs = d.contacts, ref = cs.length ? cs[Math.min(1, cs.length - 1)].d : 2e3;   // au moins deux contacts dans le cercle
    const w = STEPS.find(s => s >= ref*1.3) || STEPS[STEPS.length - 1];
    if(w !== St.want){ St.want = w; St.wantT = now; }
    if(d.name !== St.subj){ St.subj = d.name; St.range = w; }                    // nouveau sujet : portée immédiate
    else if(St.range !== St.want && now - St.wantT > 1200) St.range = St.want;   // sinon, après 1,2 s (pas de pompage)
    const head = esc(d.reg); if(head !== St.head){ St.head = head; sj.textContent = d.reg; }
    const rt = fmtRange(St.range); if(rgEl.textContent !== rt) rgEl.textContent = rt;
    const h = cs.slice(0, 4).map((c, i) => '<div class="' + (i === 0 ? 'n1' : '') + (c.d > St.range ? ' out' : '') + '"><span class="d">' + C.fmtU(c.d) + '</span><span class="r">' + esc(c.reg) + '</span>' + esc(c.name) + '</div>').join('') || '<div class="out">no contact</div>';
    if(h !== St.listHtml){ St.listHtml = h; ls.innerHTML = h; }
    St.costU += performance.now() - t0; St.nU++;
  }
  let bg = null;
  function background(){ if(bg && bg.width === cv.width) return bg;
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; const g = bg.getContext('2d'), S = St.size, c = S/2, R = c - 4;
    g.setTransform(St.dpr, 0, 0, St.dpr, 0, 0);
    g.fillStyle = 'rgba(11,18,32,.8)'; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    // cercles de portée (échelle racine : 1/9 et 4/9 de la portée), réticule, graduations tous les 30°
    g.lineWidth = 1; g.strokeStyle = 'rgba(37,55,92,.95)'; g.setLineDash([2, 4]);
    [R/3, R*2/3].forEach(r => { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }); g.setLineDash([]);
    g.beginPath(); g.arc(c, c, R, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(37,55,92,.6)'; g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
    g.strokeStyle = 'rgba(93,111,146,.8)'; g.beginPath(); for(let i = 0; i < 12; i++){ const a = i*TAU/12, l = i % 3 === 0 ? 6 : 3; g.moveTo(c + Math.sin(a)*R, c - Math.cos(a)*R); g.lineTo(c + Math.sin(a)*(R - l), c - Math.cos(a)*(R - l)); } g.stroke();
    return bg; }
  function draw(now){
    const d = St.data; if(!d) return; fit();
    const t0 = performance.now(), g = ctx, S = St.size, c = S/2, R = c - 4, rg = St.range, red = reduced();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(background(), 0, 0);    // fond fixe, dessiné une fois par taille
    g.setTransform(St.dpr, 0, 0, St.dpr, 0, 0);
    // balayage (4 s par tour)
    const sw = (now/4000*TAU) % TAU;
    if(!red){
      if(g.createConicGradient){ const cg = g.createConicGradient(sw - 1.1 - Math.PI/2, c, c), f = 1.1/TAU; cg.addColorStop(0, 'rgba(94,234,212,0)'); cg.addColorStop(f, 'rgba(94,234,212,.2)'); cg.addColorStop(Math.min(1, f + .002), 'rgba(94,234,212,0)'); cg.addColorStop(1, 'rgba(94,234,212,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(94,234,212,.55)'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(sw)*R, c - Math.cos(sw)*R); g.stroke();
    }
    // contacts
    const placed = [];
    d.contacts.forEach((ct, i) => {
      const b = Math.atan2(ct.x, ct.y), inR = ct.d <= rg, rr = inR ? Math.max(11, R*Math.sqrt(ct.d/rg)) : R,   /* 11 px au moins : jamais sous le vaisseau central */ X = c + Math.sin(b)*rr, Y = c - Math.cos(b)*rr;
      if(!inR){ if(i > 12) return; g.fillStyle = 'rgba(93,111,146,.9)'; g.save(); g.translate(X, Y); g.rotate(b); g.beginPath(); g.moveTo(0, -4); g.lineTo(3, 1); g.lineTo(-3, 1); g.closePath(); g.fill(); g.restore(); return; }
      const near = i === 0, col = near ? '#ffb454' : (ct.mil ? '#ff6b5e' : (ct.craft ? '#8ea0c4' : '#5eead4'));   // v7.4 : militaires en rouge
      const da = ((sw - b) % TAU + TAU) % TAU, boost = red ? 0 : Math.exp(-da*2.2);
      if(boost > .05){ g.fillStyle = (near ? 'rgba(255,180,84,' : 'rgba(94,234,212,') + (boost*.45) + ')'; g.beginPath(); g.arc(X, Y, 4 + 4*boost, 0, TAU); g.fill(); }
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, ct.craft ? 1.8 : (near ? 3.2 : 2.6), 0, TAU); g.fill();
      const el = Math.asin(clamp(ct.z/ct.d, -1, 1));                             // au-dessus / au-dessous du plan du vaisseau
      if(Math.abs(el) > .26){ const s = el > 0 ? -1 : 1; g.beginPath(); g.moveTo(X - 2.5, Y + s*5); g.lineTo(X + 2.5, Y + s*5); g.lineTo(X, Y + s*8.5); g.closePath(); g.fill(); }
      if(i < 4 && S > 150){ g.font = F(9); const t = ct.reg, w = g.measureText(t).width, left = X > c + R*.35, tx = left ? X - 6 - w : X + 6, ty = Y - 5;
        if(!placed.some(r => tx < r[0] + r[2] && tx + w > r[0] && ty < r[1] + 10 && ty + 10 > r[1])){ placed.push([tx, ty, w]);
          g.textBaseline = 'top'; g.lineWidth = 3; g.strokeStyle = 'rgba(5,8,15,.85)'; g.strokeText(t, tx, ty); g.fillStyle = near ? '#ffb454' : '#d5dcea'; g.fillText(t, tx, ty); } }
    });
    // vaisseau filmé au centre, nez vers le haut
    g.fillStyle = '#ffb454'; g.beginPath(); g.moveTo(c, c - 6); g.lineTo(c + 4, c + 4); g.lineTo(c, c + 2); g.lineTo(c - 4, c + 4); g.closePath(); g.fill();
    St.costD += performance.now() - t0; St.nD++;
  }
  function frame(now, allowed){
    const show = St.on && allowed;
    if(show && (now - St.tData > 100 || !St.data)){ St.tData = now; update(now); }
    else if(!show) St.data = null;
    const vis = show && !!St.data;
    if(vis !== St.vis){ St.vis = vis; el.classList.toggle('on', vis); document.body.classList.toggle('rd-on', vis); }
    if(vis && now - St.tDraw > 30){ St.tDraw = now; draw(now); }
  }
  window.__RADAR = { frame, toggle(){ St.on = !St.on; return St.on; }, set(on){ St.on = !!on; }, isOn: () => St.on,
    stats: () => ({ on: St.on, vis: St.vis, range: St.range, n: St.data ? St.data.contacts.length : 0, msUpdate: St.nU ? +(St.costU/St.nU).toFixed(3) : 0, msDraw: St.nD ? +(St.costD/St.nD).toFixed(3) : 0 }), _reset(){ St.costU = St.costD = 0; St.nU = St.nD = 0; } };
})();
