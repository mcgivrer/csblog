/* Copie de la démo « Observation des étoiles » v7.2.2 (src/starmap.js), adaptée au jeu (lot L4) :
   - traduction fr / de / es par trm() (textes du canevas et des panneaux ; l'anglais d'origine reste inchangé) ;
   - types de planètes : libellés du jeu (planetKind_*) ;
   - pas d'action « caméra » (le jeu n'a pas le réalisateur de la démo) : les objets du système courant sont consultables seulement ;
   - refus du ciblage selon les règles du jeu (§23) : générateur requis, portée, carburant ;
   - le reste (niveaux secteur / système / orbite, gestes, rendu) est celui de la démo. Données : window.__CINE fourni par 20e-carte-2d.js. */
/* =====================================================================
   CARTE DE L'UNIVERS (lot 2, v6.8) — touche M
   Vue de dessus en 2D (canevas), trois niveaux enchaînés par le zoom :
   - secteur : étoiles (couleur spectrale, éclat selon la luminosité), nébuleuses rejouées depuis leur graine,
     itinéraire parcouru, prochain saut, héros ; systèmes miniatures quand on s'approche ;
   - système : orbites à l'échelle logarithmique, planètes nommées, lunes, ceinture, zone habitable, vaisseaux ;
   - orbite : planète, lunes, vaisseaux en orbite (altitude à l'échelle logarithmique).
   Double-clic (ou bouton) : la caméra y va — ou l'étoile devient le prochain saut.
   Données : cellules du moteur (starDataForCell), API __CINE (systemInfo, shipsInfo, mapState, focus). Charte McGivrer.
   ===================================================================== */
(function(){
  const C = window.__CINE; if(!C) return;
  const TAU = Math.PI*2, CELL = 190, NCELL = 1600, LY = 9.4607e15;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x*x*(3 - 2*x);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const KIND_EN = { ocean:'Ocean world', continental:'Continental world', desert:'Desert world', ice:'Ice world', volcanic:'Volcanic world', gas:'Gas giant' };
  const NEB_EN = { emission:'Emission nebula', hii:'H II region', dark:'Dark nebula', planetary:'Planetary nebula', supernova:'Supernova remnant', nursery:'Stellar nursery', reflection:'Reflection nebula', molecular:'Molecular cloud', oiii:'O III emission nebula' };
  const KCOL = (typeof PLANET_KIND_COLORS !== 'undefined' && PLANET_KIND_COLORS) || { ocean:['#123a63','#5eb8e0'], continental:['#2e4a26','#c9a86a'], desert:['#7a4f22','#e8c088'], ice:['#7fa8c0','#f0fbff'], volcanic:['#3a0f0a','#ff7a3d'], gas:['#8a5a28','#e8c896'] };

  /* ---------- traduction (jeu : fr / en / de / es) — ajout L4 pour le jeu Space Travel & Transport ----------
     Tous les textes de la carte passent par trm() : canevas (fillText/measureText enveloppés), panneaux
     HTML, bandeaux. Remplacement par expressions entières, les plus longues d'abord ; anglais inchangé. */
  const TR_DICT = [["ASTEROID BELT", "CEINTURE D’ASTÉROÏDES", "ASTEROIDENGÜRTEL", "CINTURÓN DE ASTEROIDES"], ["wheel / pinch zoom · drag pan · double-click go · M close", "molette / pincer : zoom · glisser : déplacer · double-clic : aller · M : fermer", "Mausrad / Zwei-Finger: Zoom · Ziehen: verschieben · Doppelklick: los · M: schließen", "rueda / pellizco: zoom · arrastrar: mover · doble clic: ir · M: cerrar"], ["UNIVERSE MAP", "CARTE DE L’UNIVERS", "UNIVERSUMSKARTE", "MAPA DEL UNIVERSO"], ["Universe map", "Carte de l’univers", "Universumskarte", "Mapa del universo"], ["Map level", "Niveau de carte", "Kartenebene", "Nivel del mapa"], ["Center on current system", "Centrer sur le système actuel", "Auf aktuelles System zentrieren", "Centrar en el sistema actual"], ["Current system", "Système actuel", "Aktuelles System", "Sistema actual"], ["current system", "système actuel", "aktuelles System", "sistema actual"], ["Zoom in", "Zoom avant", "Vergrößern", "Acercar"], ["Zoom out", "Zoom arrière", "Verkleinern", "Alejar"], ["Double-click a target = same action", "Double-clic sur une cible = même action", "Doppelklick auf ein Ziel = gleiche Aktion", "Doble clic en un objetivo = misma acción"], ["TARGET", "CIBLE", "ZIEL", "OBJETIVO"], ["VOYAGE", "VOYAGE", "REISE", "VIAJE"], ["SECTOR", "SECTEUR", "SEKTOR", "SECTOR"], ["No target — click a star, planet, ship or nebula.", "Aucune cible — cliquez une étoile, une planète, un vaisseau ou une nébuleuse.", "Kein Ziel — klicken Sie auf einen Stern, einen Planeten, ein Schiff oder einen Nebel.", "Sin objetivo — haga clic en una estrella, un planeta, una nave o una nebulosa."], ["Zoom in on a star to open its system.", "Zoomez sur une étoile pour ouvrir son système.", "Zoomen Sie auf einen Stern, um sein System zu öffnen.", "Acérquese a una estrella para abrir su sistema."], ["Ships are only tracked in the current system.", "Vaisseaux suivis uniquement dans le système actuel.", "Schiffe werden nur im aktuellen System verfolgt.", "Las naves solo se siguen en el sistema actual."], ["Objects of the current system have no action.", "Les objets du système actuel n’ont pas d’action.", "Objekte des aktuellen Systems haben keine Aktion.", "Los objetos del sistema actual no tienen acción."], ["Quantum jump module required (port services).", "Générateur de saut quantique requis (services du port).", "Quantensprungmodul erforderlich (Hafendienste).", "Se requiere el módulo de salto cuántico (servicios del puerto)."], ["Out of jump range: the 24 nearest stars only.", "Hors de portée de saut : les 24 étoiles les plus proches seulement.", "Außerhalb der Sprungreichweite: nur die 24 nächsten Sterne.", "Fuera del alcance de salto: solo las 24 estrellas más cercanas."], ["Not enough fuel for this jump.", "Carburant insuffisant pour ce saut.", "Nicht genug Treibstoff für diesen Sprung.", "Combustible insuficiente para este salto."], ["Not available right now.", "Indisponible pour le moment.", "Derzeit nicht verfügbar.", "No disponible por ahora."], ["▶ SET AS NEXT JUMP", "▶ DÉFINIR COMME PROCHAIN SAUT", "▶ ALS NÄCHSTEN SPRUNG SETZEN", "▶ FIJAR COMO PRÓXIMO SALTO"], ["ALREADY THE NEXT JUMP", "DÉJÀ LE PROCHAIN SAUT", "BEREITS NÄCHSTER SPRUNG", "YA ES EL PRÓXIMO SALTO"], ["▶ JUMP TO THE NEAREST STAR", "▶ SAUTER VERS L’ÉTOILE LA PLUS PROCHE", "▶ ZUM NÄCHSTEN STERN SPRINGEN", "▶ SALTAR A LA ESTRELLA MÁS CERCANA"], ["▶ JUMP TO THIS SYSTEM", "▶ SAUTER VERS CE SYSTÈME", "▶ ZU DIESEM SYSTEM SPRINGEN", "▶ SALTAR A ESTE SISTEMA"], ["▶ JUMP HERE", "▶ SAUTER ICI", "▶ HIERHER SPRINGEN", "▶ SALTAR AQUÍ"], ["departure re-planned", "départ replanifié", "Abflug neu geplant", "salida replanificada"], ["after the current jump", "après le saut en cours", "nach dem laufenden Sprung", "tras el salto en curso"], ["already planned", "déjà prévu", "bereits geplant", "ya previsto"], ["is the current system", "est le système actuel", "ist das aktuelle System", "es el sistema actual"], ["after the jump", "après le saut", "nach dem Sprung", "tras el salto"], ["arrival at", "arrivée à", "Ankunft bei", "llegada a"], ["(near", "(près de", "(nahe", "(cerca de"], ["NEXT JUMP", "PROCHAIN SAUT", "NÄCHSTER SPRUNG", "PRÓXIMO SALTO"], ["next jump", "prochain saut", "nächster Sprung", "próximo salto"], ["QUEUED", "EN ATTENTE", "VORGEMERKT", "EN COLA"], ["Queued", "En attente", "Vorgemerkt", "En cola"], ["CURRENT", "ACTUEL", "AKTUELL", "ACTUAL"], ["HABITABLE ZONE", "ZONE HABITABLE", "HABITABLE ZONE", "ZONA HABITABLE"], ["HABITABLE", "HABITABLE", "BEWOHNBAR", "HABITABLE"], ["Habitable", "Habitable", "Bewohnbar", "Habitable"], ["TOP VIEW", "VUE DE DESSUS", "DRAUFSICHT", "VISTA SUPERIOR"], ["SLICE", "TRANCHE", "SCHICHT", "CORTE"], ["LOADING…", "CHARGEMENT…", "LADEN…", "CARGANDO…"], ["LOG SCALE", "ÉCHELLE LOG", "LOG-SKALA", "ESCALA LOG"], ["OUTER ORBIT", "ORBITE EXTÉRIEURE", "ÄUSSERE BAHN", "ÓRBITA EXTERIOR"], ["SHIPS IN ORBIT", "VAISSEAUX EN ORBITE", "SCHIFFE IM ORBIT", "NAVES EN ÓRBITA"], ["Ships in orbit", "Vaisseaux en orbite", "Schiffe im Orbit", "Naves en órbita"], ["NOT VISITED", "NON VISITÉ", "NICHT BESUCHT", "NO VISITADO"], ["ALTITUDE", "ALTITUDE", "HÖHE", "ALTITUD"], ["Asteroid belt", "Ceinture d’astéroïdes", "Asteroidengürtel", "Cinturón de asteroides"], ["Inner edge", "Bord intérieur", "Innenrand", "Borde interior"], ["Outer edge", "Bord extérieur", "Außenrand", "Borde exterior"], ["MOON OF", "LUNE DE", "MOND VON", "LUNA DE"], ["RINGS", "ANNEAUX", "RINGE", "ANILLOS"], ["ON SCREEN", "À L’ÉCRAN", "IM BILD", "EN PANTALLA"], ["HERO", "VOTRE VAISSEAU", "IHR SCHIFF", "SU NAVE"], ["From the hero", "Depuis votre vaisseau", "Von Ihrem Schiff", "Desde su nave"], ["Registration", "Immatriculation", "Kennung", "Matrícula"], ["Length", "Longueur", "Länge", "Longitud"], ["Class", "Classe", "Klasse", "Clase"], ["Luminosity", "Luminosité", "Leuchtkraft", "Luminosidad"], ["Temperature", "Température", "Temperatur", "Temperatura"], ["Distance", "Distance", "Entfernung", "Distancia"], ["Planets", "Planètes", "Planeten", "Planetas"], ["Diameter", "Diamètre", "Durchmesser", "Diámetro"], ["Radius", "Rayon", "Radius", "Radio"], ["Orbit", "Orbite", "Umlaufbahn", "Órbita"], ["Moons", "Lunes", "Monde", "Lunas"], ["Phase", "Phase", "Phase", "Fase"], ["Type", "Type", "Typ", "Tipo"], ["Hero", "Vaisseau", "Schiff", "Nave"], ["Next", "Prochain", "Nächster", "Próximo"], ["At", "Position", "Position", "Posición"], ["in orbit", "en orbite", "im Orbit", "en órbita"], ["departing", "départ", "Abflug", "partida"], ["quantum jump", "saut quantique", "Quantensprung", "salto cuántico"], ["superluminal", "supraluminique", "überlichtschnell", "superlumínico"], ["warp drive", "distorsion", "Warpantrieb", "distorsión"], ["local trade", "commerce local", "lokaler Handel", "comercio local"], ["arrival", "arrivée", "Ankunft", "llegada"], [" Nebula", " (nébuleuse)", " (Nebel)", " (nebulosa)"], ["nebula", "nébuleuse", "Nebel", "nebulosa"], ["Emission nebula", "Nébuleuse en émission", "Emissionsnebel", "Nebulosa de emisión"], ["H II region", "Région H II", "H-II-Region", "Región H II"], ["Dark nebula", "Nébuleuse obscure", "Dunkelnebel", "Nebulosa oscura"], ["Planetary nebula", "Nébuleuse planétaire", "Planetarischer Nebel", "Nebulosa planetaria"], ["Supernova remnant", "Rémanent de supernova", "Supernovaüberrest", "Remanente de supernova"], ["Stellar nursery", "Pépinière d’étoiles", "Sternentstehungsgebiet", "Guardería estelar"], ["Reflection nebula", "Nébuleuse par réflexion", "Reflexionsnebel", "Nebulosa de reflexión"], ["O III emission nebula", "Nébuleuse en émission O III", "O-III-Emissionsnebel", "Nebulosa de emisión O III"], ["Molecular cloud", "Nuage moléculaire", "Molekülwolke", "Nube molecular"], ["ships", "vaisseaux", "Schiffe", "naves"], ["ship", "vaisseau", "Schiff", "nave"], ["route", "itinéraire", "Route", "ruta"], ["hero", "votre vaisseau", "Ihr Schiff", "su nave"], ["belt", "ceinture", "Gürtel", "cinturón"], ["up", "d’altitude", "Höhe", "de altitud"], ["ly", "al", "Lj", "al"], ["AU", "ua", "AE", "ua"]];
  const TR_COL = { fr: 1, de: 2, es: 3 };
  const TR_RE = TR_DICT.slice().sort((a, b) => b[0].length - a[0].length).map(r => {
    const e = r[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), w0 = /^[A-Za-z]/.test(r[0]) ? '(?<![A-Za-z\u00c0-\u00ff])' : '', w1 = /[A-Za-z.]$/.test(r[0]) ? '(?![A-Za-z\u00c0-\u00ff])' : '';
    return [new RegExp(w0 + e + w1, 'g'), r]; });
  const TR_MEMO = new Map();
  function trm(s){
    if(s == null) return s;
    const lang = (typeof LANG !== 'undefined') ? LANG : 'en', col = TR_COL[lang]; if(!col) return s;
    const k = lang + '\u0001' + s; let o = TR_MEMO.get(k); if(o !== undefined) return o;
    o = String(s); for(const [re, row] of TR_RE) o = o.replace(re, row[col]);
    if(TR_MEMO.size > 4000) TR_MEMO.clear(); TR_MEMO.set(k, o); return o;
  }
  const KIND_T = k => { const s = (typeof t === 'function') ? t('planetKind_' + k) : null; return (s && s !== 'planetKind_' + k) ? s.charAt(0).toUpperCase() + s.slice(1) : trm(KIND_EN[k] || k); };
  const F = (px, w) => (w || '') + ' ' + px + "px 'JetBrains Mono', ui-monospace, monospace";
  const lyOf = u => u*C.UNIT_GAL/LY;
  const num = x => Math.abs(x) >= 99.95 ? x.toFixed(0) : Math.abs(x) >= 9.995 ? x.toFixed(1) : x.toFixed(2);
  const fmtLy = u => num(lyOf(u)) + ' ly';
  const fmtAU = m => num(m/C.AU) + ' AU';
  const fmtKm = m => String(Math.round(m/1e3)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const rgb = c => Math.round(clamp(c[0], 0, 1)*255) + ',' + Math.round(clamp(c[1], 0, 1)*255) + ',' + Math.round(clamp(c[2], 0, 1)*255);
  const hexRgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

  /* ---------- DOM ---------- */
  const css = document.createElement('style');
  css.textContent =
    "#stmMap{position:fixed;inset:0;z-index:12;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.84);font-family:'JetBrains Mono',monospace;color:#e8edf5}" +
    "#stmMap.on{display:flex}" +
    "#stmMap .p{position:relative;width:min(1240px,95vw);height:min(800px,92vh);display:flex;flex-direction:column;border:1px solid #25375c;background:rgba(11,18,32,.82)}" +
    "#stmMap .p::before,#stmMap .p::after{content:'';position:absolute;width:16px;height:16px;border:1.5px solid #ffb454;pointer-events:none}" +
    "#stmMap .p::before{top:-1px;left:-1px;border-right:none;border-bottom:none}#stmMap .p::after{bottom:-1px;right:-1px;border-left:none;border-top:none}" +
    "#stmMap .bar{display:flex;align-items:center;gap:16px;padding:12px 18px;background:rgba(15,26,48,.94);border-bottom:1px solid #25375c}" +
    "#stmMap .ttl{font-weight:700;font-size:14px;letter-spacing:.12em;white-space:nowrap}" +
    "#stmMap .crumb{display:flex;gap:7px;font-size:11px;color:#5d6f92;flex:1;min-width:0;overflow:hidden;white-space:nowrap;letter-spacing:.06em}" +
    "#stmMap .crumb button{font:inherit;letter-spacing:inherit;color:#8ea0c4;background:none;border:0;padding:0;cursor:pointer;text-transform:uppercase}" +
    "#stmMap .crumb button:hover,#stmMap .crumb button:focus-visible{color:#ffb454;outline:0}#stmMap .crumb .cur{color:#e8edf5;text-transform:uppercase}" +
    "#stmMap .hint{font-size:10.5px;color:#5d6f92;white-space:nowrap}" +
    "#stmMap .x{font:inherit;font-size:17px;line-height:1;color:#5d6f92;background:none;border:0;cursor:pointer;padding:2px 4px}#stmMap .x:hover,#stmMap .x:focus-visible{color:#ff6b57;outline:0}" +
    "#stmMap .body{flex:1;display:flex;gap:14px;padding:14px 18px;min-height:0}" +
    "#stmMap .view{position:relative;flex:1;min-width:0;min-height:0;border:1px dashed rgba(216,222,233,.28);overflow:hidden;background:rgba(6,10,19,.92)}" +
    "#stmMap canvas{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:grab;display:block}#stmMap canvas.pt{cursor:pointer}#stmMap canvas.dr{cursor:grabbing}" +
    "#stmMap .zm{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:4px}" +
    "#stmMap .zm button{width:28px;height:28px;font:inherit;font-size:14px;line-height:1;color:#8ea0c4;background:rgba(15,26,48,.88);border:1px solid #25375c;cursor:pointer;padding:0;border-radius:0}" +
    "#stmMap .zm button:hover,#stmMap .zm button:focus-visible{color:#ffb454;border-color:#a97a3d;outline:0}" +
    "#stmMap .side{width:282px;flex:none;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:auto}" +
    "#stmMap .box{border:1px dashed #25375c;background:rgba(15,26,48,.94);padding:13px 14px;font-size:11.5px;color:#8ea0c4}" +
    "#stmMap .bt{font-weight:700;font-size:11px;letter-spacing:.1em;color:#e8edf5;margin-bottom:9px}" +
    "#stmMap .nm{font-size:14px;color:#e8edf5;margin-bottom:4px;word-break:break-word}#stmMap .nm.a{color:#ffb454}" +
    "#stmMap .ln{font-size:11px;color:#5d6f92;margin-bottom:3px;display:flex;justify-content:space-between;gap:10px}#stmMap .ln b{font-weight:400;color:#8ea0c4;text-align:right}" +
    "#stmMap .tag{display:inline-block;font-size:9.5px;letter-spacing:.1em;padding:1px 6px;border:1px solid currentColor;margin:2px 6px 6px 0}" +
    "#stmMap .tag.c{color:#5eead4}#stmMap .tag.a{color:#ffb454}#stmMap .tag.m{color:#8ea0c4}" +
    "#stmMap .empty{color:#5d6f92;font-size:11.5px;line-height:1.5}" +
    "#stmMap .go{display:block;width:100%;margin-top:10px;padding:9px;background:none;border:1.5px solid #ffb454;color:#ffb454;font:inherit;font-weight:700;font-size:12px;letter-spacing:.06em;cursor:pointer;border-radius:0}" +
    "#stmMap .go:hover,#stmMap .go:focus-visible{background:rgba(255,180,84,.14);outline:0}" +
    "#stmMap .go.g2{border:1px solid #25375c;color:#5eead4;font-weight:400;margin-top:7px}#stmMap .go.g2:hover,#stmMap .go.g2:focus-visible{border-color:#5eead4;background:rgba(94,234,212,.08)}" +
    "#stmMap .go[disabled]{border-color:#5d6f92;color:#5d6f92;cursor:default;background:none}" +
    "#stmMap .sub{margin-top:8px;font-size:9.5px;color:#5d6f92;text-align:center}#stmMap .msg{margin-top:8px;font-size:10.5px;color:#ffb454;line-height:1.45}#stmMap .msg:empty{display:none}" +
    "#stmMap .leg{display:flex;flex-wrap:wrap;gap:8px 20px;padding:9px 18px;background:rgba(15,26,48,.94);border-top:1px solid #25375c;font-size:10.5px;color:#5d6f92}" +
    "#stmMap .leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1.5px solid #5d6f92}" +
    "#stmMap .leg i.c{border-color:#5eead4}#stmMap .leg i.n{border-color:#ffb454;box-shadow:0 0 0 2px rgba(255,180,84,.25)}#stmMap .leg i.r{border-style:dashed}" +
    "#stmMap .leg i.h{background:#ffb454;border-color:#ffb454;border-radius:0;width:7px;height:7px}#stmMap .leg i.s{background:#5eead4;border-color:#5eead4;width:6px;height:6px}" +
    "#stmMap .leg i.b{border:0;background:radial-gradient(circle,rgba(190,120,255,.8),rgba(190,120,255,0) 70%);width:12px;height:12px}" +
    "#stmMap .leg .sc{margin-left:auto;color:#8ea0c4}" +
    "@media (max-width:760px),(max-height:520px){#stmMap .p{width:100vw;height:100%;border:0}#stmMap .hint,#stmMap .leg{display:none}#stmMap .bar{padding:9px 12px;gap:10px}" +
    "#stmMap .body{padding:8px;gap:8px;flex-direction:column}#stmMap .side{width:auto;max-height:38%;flex:none}#stmMap .box{padding:10px 12px}#stmMap .voy{display:none}#stmMap .sub{display:none}}" +
    "@media (max-height:520px) and (min-width:761px){#stmMap .body{flex-direction:row}#stmMap .side{width:250px;max-height:none}}";
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'stmMap'; root.className = 'demo-ui'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Universe map'); root.setAttribute('aria-hidden', 'true');
  root.innerHTML = trm('<div class="p"><div class="bar"><span class="ttl">UNIVERSE MAP</span><nav class="crumb" aria-label="Map level"></nav>' +
    '<span class="hint">wheel / pinch zoom · drag pan · double-click go · M close</span><button type="button" class="x" title="Close (M)" aria-label="Close map">×</button></div>' +
    '<div class="body"><div class="view"><canvas aria-label="Top view map"></canvas><div class="zm"><button type="button" data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button>' +
    '<button type="button" data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button type="button" data-z="home" title="Current system (C)" aria-label="Center on current system">⌖</button></div></div>' +
    '<div class="side"><div class="box tgt"><div class="bt">TARGET</div><div class="info"></div><div class="acts"></div><div class="msg" role="status"></div><div class="sub">Double-click a target = same action</div></div>' +
    '<div class="box voy"><div class="bt">VOYAGE</div><div class="vinfo"></div></div></div></div>' +
    '<div class="leg"><span><i class="c"></i>current system</span><span><i class="n"></i>next jump</span><span><i class="r"></i>route</span><span><i class="h"></i>hero</span><span><i class="s"></i>ships</span><span><i class="b"></i>nebula</span><span class="sc"></span></div></div>');
  document.body.appendChild(root);
  // la carte garde ses entrées : rien ne remonte jusqu'aux écouteurs du jeu
  ['pointerdown','pointerup','pointermove','mousedown','mouseup','click','dblclick','wheel','touchstart','touchend','touchmove','contextmenu','keydown'].forEach(ev => root.addEventListener(ev, e => { if(ev !== 'keydown' || e.key === 'Enter' || e.key === ' ') e.stopPropagation(); if(ev === 'contextmenu') e.preventDefault(); }));
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), view = root.querySelector('.view');
  { const f0 = ctx.fillText.bind(ctx), m0 = ctx.measureText.bind(ctx); ctx.fillText = (s, x, y, w) => w === undefined ? f0(trm(s), x, y) : f0(trm(s), x, y, w); ctx.measureText = s => m0(trm(s)); }
  const $ = s => root.querySelector(s);

  /* ---------- état ---------- */
  const S = { open: false, level: 'sector', cell: null, pi: null, v: { x: 0, y: 0, k: 1 }, W: 1, H: 1, dpr: 1, sel: null, hov: null, hits: [], dirty: true,
    lastLive: 0, live: null, liveT: 0, ms: null, trans: null, diveT: 0, first: true, voyHtml: '', lastLoad: 0, sysSeen: new Set(), moons: {} };
  const snap = document.createElement('canvas');

  /* ---------- données : étoiles (cellules du moteur), nébuleuses (graine rejouée), systèmes (API) ---------- */
  const stars = new Map(); let queue = [];
  function mkStar(sd){ const s = sd.star, c = s.color; return { kind: 'star', cell: sd.cell, name: sd.name, x: sd.position.x, y: sd.position.y, z: sd.position.z, lum: s.lum, des: s.designation, temp: s.temp, col: [c.r, c.g, c.b], lumLabel: s.lumLabel }; }
  function loadSome(budget){ const t0 = performance.now(); let n = 0;
    while(queue.length && (n < 8 || performance.now() - t0 < budget)){ const q = queue.shift(); if(stars.has(q[3])) continue; const sd = starDataForCell(q[0], q[1], q[2]); stars.set(q[3], sd ? mkStar(sd) : null); n++; }
    if(stars.size > 24000) stars.clear();
    return n; }
  function starOf(cell){ let s = stars.get(cell); if(s !== undefined) return s; const c = cell.split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]); s = sd ? mkStar(sd) : null; stars.set(cell, s); return s; }
  const nebs = new Map();
  function nebAt(x, y, z){ const k = x + ',' + y + ',' + z; if(nebs.has(k)) return nebs.get(k); if(nebs.size > 240) nebs.clear();   // images 128² en cache : ≤ 15 Mo
    const a = rngFor(SEED + ':nebula:' + x + ':' + y + ':' + z); let e = null;           // même tirage que buildNebulaCell du moteur, sans maillage
    if(!(a() > .42)){ const ox = NCELL*(a() - .5)*.7, oy = NCELL*(a() - .5)*.7, oz = NCELL*(a() - .5)*.7, ti = Math.floor(a()*NEBULA_TYPES.length), T = NEBULA_TYPES[ti], name = generateName(a), R = 420 + 480*a();
      e = { kind: 'nebula', key: k, name, type: T.key, x: NCELL*x + ox, y: NCELL*y + oy, z: NCELL*z + oz, R, cA: T.colorA, cB: T.colorB }; }
    nebs.set(k, e); return e; }
  function nebSprite(n){ if(n.spr) return n.spr;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = rngFor(SEED + ':mapneb:' + n.key), A = hexRgb(n.cA), B = hexRgb(n.cB), dark = n.type === 'dark';
    g.globalCompositeOperation = dark ? 'source-over' : 'lighter';
    for(let i = 0; i < 12; i++){ const a = r()*TAU, d = Math.pow(r(), .7)*30, x = 64 + Math.cos(a)*d, y = 64 + Math.sin(a)*d, rad = 16 + r()*(34 - d*.45), m = r();
      const col = [0, 1, 2].map(j => Math.round(A[j]*(1 - m) + B[j]*m)).join(','), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(' + col + ',' + (dark ? .5 : .2 + .12*r()) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
    return (n.spr = c); }
  const glowCache = new Map();
  function glow(c){ const q = c.map(x => Math.round(clamp(x, 0, 1)*12)), key = q.join(','); let s = glowCache.get(key); if(s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64; const g = s.getContext('2d'), col = q.map(x => Math.round(x*21.25)).join(','), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.1, 'rgba(' + col + ',1)'); gr.addColorStop(.3, 'rgba(' + col + ',.32)'); gr.addColorStop(.6, 'rgba(' + col + ',.08)'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache.set(key, s); return s; }
  function sysMap(info){ if(info._m) return info._m;                                    // échelle logarithmique des orbites (rayon 1 = orbite extérieure)
    const as = info.planets.map(p => p.a), aMin = Math.min.apply(null, as), rMax = Math.max(Math.max.apply(null, as), info.belt ? info.belt[1] : 0, info.hz[1])*1.12, r0 = aMin*.3, L = Math.log(1 + rMax/r0);
    return (info._m = { f: r => Math.log(1 + Math.max(0, r)/r0)/L, rMax }); }
  function beltSpecks(info){ if(info._belt) return info._belt; const r = rngFor(SEED + ':mapbelt:' + info.cell), m = sysMap(info), u0 = m.f(info.belt[0]), u1 = m.f(info.belt[1]), out = [];
    for(let i = 0; i < 520; i++){ const u = u0 + (u1 - u0)*(.5 + (r() - .5)*(r() + r())*.9), a = r()*TAU; out.push([u*Math.cos(a), -u*Math.sin(a), .25 + .5*r()]); }
    return (info._belt = out); }
  function liveShips(){ const now = performance.now(); if(!S.live || now - S.liveT > 190){ S.live = C.shipsInfo(); S.liveT = now; S.moons = {}; } return S.live; }
  function liveMoons(i){ liveShips(); return S.moons[i] || (S.moons[i] = C.moonsInfo(i)); }
  function planetPos(info, p){ const s = info.basis.s, l = info.basis.l, c = Math.cos(p.ang)*p.a, n = Math.sin(p.ang)*p.a; return [s[0]*c + l[0]*n, s[1]*c + l[1]*n, s[2]*c + l[2]*n]; }
  function nearestPlanet(info, pos){ let best = null, bd = Infinity; info.planets.forEach(p => { const d = dist3(pos, planetPos(info, p)); if(d < bd){ bd = d; best = p; } }); return { p: best, d: bd }; }

  /* ---------- géométrie de la vue ---------- */
  const base = () => Math.min(S.W, S.H)*.45;
  function limits(){ if(S.level === 'sector') return { min: S.W/6000, max: S.W/230 }; const b = base(); return S.level === 'system' ? { min: b*.55, max: b*16 } : { min: b*.55, max: b*8 }; }
  function resize(){ const r = view.getBoundingClientRect(), W = Math.max(50, r.width), H = Math.max(50, r.height), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const kr = S.level === 'sector' ? W/S.W : Math.min(W, H)/Math.min(S.W, S.H);
    if(isFinite(kr) && kr > 0 && S.W > 1) S.v.k *= kr;
    S.W = W; S.H = H; S.dpr = dpr; cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); snap.width = cv.width; snap.height = cv.height; S.dirty = true; }
  window.addEventListener('resize', () => { if(S.open) resize(); });
  function toUnit(px, py){ return [S.v.x + (px - S.W/2)/S.v.k, S.v.y + (py - S.H/2)/S.v.k]; }
  function pan(dx, dy){ S.v.x -= dx/S.v.k; S.v.y -= dy/S.v.k; S.dirty = true; }
  function zoomBy(f, px, py){
    if(px == null){ px = S.W/2; py = S.H/2; }
    const lim = limits(); let k2 = S.v.k*f;
    if(k2 > lim.max*1.001){ if(f > 1 && S.v.k >= lim.max*.98 && tryDive(px, py)) return; k2 = lim.max; }
    if(k2 < lim.min*.999){ if(f < 1 && S.v.k <= lim.min*1.02 && tryRise()) return; k2 = lim.min; }
    const a = toUnit(px, py); S.v.k = k2; const b = toUnit(px, py); S.v.x += a[0] - b[0]; S.v.y += a[1] - b[1]; S.dirty = true; }
  function startTrans(fx, fy, inward){ if(reduced()) return; const g = snap.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, snap.width, snap.height); g.drawImage(cv, 0, 0); S.trans = { t0: performance.now(), dur: 340, fx, fy, inward }; }
  function goSector(gal, k){ S.level = 'sector'; S.cell = null; S.pi = null; S.v = { x: gal[0], y: gal[2], k: k || S.W/1500 }; S.dirty = true; crumb(); }
  function goSystem(cell){ if(!C.systemInfo(cell)) return false; S.level = 'system'; S.cell = cell; S.pi = null; S.v = { x: 0, y: 0, k: base() }; S.dirty = true; crumb(); return true; }
  function goPlanet(cell, i){ S.level = 'planet'; S.cell = cell; S.pi = i; S.v = { x: 0, y: 0, k: base() }; S.dirty = true; crumb(); }
  function enterSystem(cell, fx, fy){ startTrans(fx, fy, true); if(!goSystem(cell)) S.trans = null; }
  function enterPlanet(i, fx, fy){ startTrans(fx, fy, true); goPlanet(S.cell, i); }
  function riseToSystem(){ const i = S.pi; startTrans(S.W/2, S.H/2, false); goSystem(S.cell);
    const info = C.systemInfo(S.cell), p = info && info.planets[i]; if(p){ const u = sysMap(info).f(p.a); S.v.k = base()*2.2; S.v.x = u*Math.cos(p.ang)*.6; S.v.y = -u*Math.sin(p.ang)*.6; } }
  function riseToSector(){ const info = C.systemInfo(S.cell); startTrans(S.W/2, S.H/2, false); goSector(info ? info.gal : S.ms.cur.gal, S.W/620); }
  function tryDive(px, py){
    const now = performance.now(); if(now - S.diveT < 500) return true;
    if(S.level === 'planet') return false;
    let best = null, bd = 70; S.hits.forEach(h => { if(h.ring || !h.o) return; if(S.level === 'sector' ? h.o.kind !== 'star' : h.o.kind !== 'planet') return; const d = Math.hypot(h.x - px, h.y - py); if(d < bd){ bd = d; best = h; } });
    if(!best) return false; S.diveT = now;
    if(S.level === 'sector') enterSystem(best.o.cell, best.x, best.y); else enterPlanet(best.o.i, best.x, best.y);
    return true; }
  function tryRise(){ const now = performance.now(); if(now - S.diveT < 500) return true; S.diveT = now;
    if(S.level === 'planet'){ riseToSystem(); return true; } if(S.level === 'system'){ riseToSector(); return true; } return false; }
  function home(){ S.ms = C.mapState(); startTrans(S.W/2, S.H/2, S.level === 'sector'); goSector(S.ms.cur.gal, S.W/1500); }

  /* ---------- fil d'Ariane ---------- */
  function crumb(){ const n = $('.crumb'), info = S.cell ? C.systemInfo(S.cell) : null, p = info && S.pi != null ? info.planets[S.pi] : null;
    let h = S.level === 'sector' ? '<span class="cur">SECTOR</span>' : '<button type="button" data-l="sector">SECTOR</button> ›';
    if(info) h += ' ' + (S.level === 'system' ? '<span class="cur">' + esc(info.name) + '</span>' : '<button type="button" data-l="system">' + esc(info.name) + '</button> ›');
    if(p) h += ' <span class="cur">' + esc(p.name) + '</span>';
    n.innerHTML = trm(h); }
  $('.crumb').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; if(b.dataset.l === 'sector') riseToSectorFrom(); else if(b.dataset.l === 'system') riseToSystem(); });
  function riseToSectorFrom(){ riseToSector(); }

  /* ---------- dessin ---------- */
  function label(g, placed, text, X, Y, font, color, force, sub, subColor){
    g.font = font; const w = g.measureText(text).width, sw = sub ? (g.font = F(9), g.measureText(sub).width) : 0, W2 = Math.max(w, sw), H2 = sub ? 22 : 11;
    const cands = [[X + 9, Y - 6], [X - 9 - W2, Y - 6], [X - W2/2, Y + 9], [X - W2/2, Y - 9 - H2]];
    const inB = c => c[0] >= 2 && c[0] + W2 <= S.W - 2 && c[1] >= 2 && c[1] + H2 <= S.H - 2;
    const free = c => !placed.some(r => c[0] < r[0] + r[2] && c[0] + W2 > r[0] && c[1] < r[1] + r[3] && c[1] + H2 > r[1]);
    // libre et dans la vue ; sinon (repère imposé) dans la vue ; sinon à droite
    const at = cands.find(c => inB(c) && free(c)) || (force ? (cands.find(inB) || cands[0]) : null);
    if(!at) return false;
    const x = at[0], y = at[1];
    placed.push([x - 2, y - 1, W2 + 4, H2 + 2]);
    g.textBaseline = 'top'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(5,8,15,.85)';
    g.font = font; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
    if(sub){ g.font = F(9); g.strokeText(sub, x, y + 12); g.fillStyle = subColor || '#5d6f92'; g.fillText(sub, x, y + 12); }
    return true; }
  function brackets(g, X, Y, r, col){ const a = Math.max(4, r*.45); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { g.moveTo(X + sx*r, Y + sy*(r - a)); g.lineTo(X + sx*r, Y + sy*r); g.lineTo(X + sx*(r - a), Y + sy*r); }); g.stroke(); }
  function chevron(g, X, Y, ang, s, col){ g.save(); g.translate(X, Y); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(s*1.3, 0); g.lineTo(-s, s*.8); g.lineTo(-s*.45, 0); g.lineTo(-s, -s*.8); g.closePath(); g.fill(); g.restore(); }
  function disc(g, X, Y, r, p, la){                                                     // planète : dégradé du jeu, face éclairée vers l'étoile
    const c = KCOL[p.kind] || KCOL.continental, lx = Math.cos(la), ly = Math.sin(la);
    const gr = g.createRadialGradient(X + lx*r*.4, Y + ly*r*.4, r*.08, X, Y, r*1.05); gr.addColorStop(0, c[1]); gr.addColorStop(1, c[0]);
    g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
    if(p.gas && r > 7){ g.save(); g.beginPath(); g.arc(X, Y, r, 0, TAU); g.clip(); g.globalAlpha = .22; for(let t = -2; t <= 2; t++){ g.fillStyle = t % 2 === 0 ? c[0] : c[1]; g.fillRect(X - r, Y + t*r*.38 - .11*r, 2*r, .2*r); } g.restore(); }
    const sh = g.createLinearGradient(X + lx*r, Y + ly*r, X - lx*r, Y - ly*r); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(.5, 'rgba(0,0,0,.12)'); sh.addColorStop(1, 'rgba(0,0,0,.8)');
    g.fillStyle = sh; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
    if(p.atmo && r > 5){ g.strokeStyle = 'rgba(120,190,235,.32)'; g.lineWidth = Math.max(1, r*.07); g.beginPath(); g.arc(X, Y, r*1.05, la - 1.9, la + 1.9); g.stroke(); } }
  function ringArc(g, X, Y, r, front){ g.strokeStyle = 'rgba(232,200,150,.55)'; g.lineWidth = Math.max(1, r*.14); g.beginPath(); g.ellipse(X, Y, r*2.15, r*.6, -.35, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke(); }
  function hit(x, y, r, o, pri){ S.hits.push({ x, y, r, o, pri }); }

  function drawSector(g, W, H){
    const ms = S.ms, V = S.v, k = V.k, cy = ms.cur.gal[1], cyc = Math.round(cy/CELL), placed = [];
    const px = x => W/2 + (x - V.x)*k, py = z => H/2 + (z - V.y)*k;
    const x0 = V.x - W/2/k, x1 = V.x + W/2/k, z0 = V.y - H/2/k, z1 = V.y + H/2/k, zf = clamp(Math.sqrt(k/(W/1600)), .75, 2.4);
    // grille : cellules de 190 u ; blocs de 950 u (≈ 81 al) repérés lettre + numéro, comme les cartes du jeu
    const cellPx = CELL*k, step = cellPx > 26 ? CELL : CELL*5, B5 = CELL*5;
    g.lineWidth = 1;
    for(let gx = Math.floor(x0/step)*step; gx <= x1; gx += step){ const X = Math.round(px(gx)) + .5, maj = Math.abs(gx/B5 - Math.round(gx/B5)) < 1e-6; g.strokeStyle = maj ? 'rgba(37,55,92,.6)' : 'rgba(37,55,92,.28)'; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, H); g.stroke(); }
    for(let gz = Math.floor(z0/step)*step; gz <= z1; gz += step){ const Y = Math.round(py(gz)) + .5, maj = Math.abs(gz/B5 - Math.round(gz/B5)) < 1e-6; g.strokeStyle = maj ? 'rgba(37,55,92,.6)' : 'rgba(37,55,92,.28)'; g.beginPath(); g.moveTo(0, Y); g.lineTo(W, Y); g.stroke(); }
    g.font = F(10, 700); g.fillStyle = 'rgba(255,255,255,.34)'; g.textBaseline = 'top'; g.textAlign = 'center';
    for(let c = Math.floor(x0/B5); c <= Math.floor(x1/B5); c++){ const X = px((c + .5)*B5); if(X > 10 && X < W - 44) g.fillText(String.fromCharCode(65 + ((c % 26) + 26) % 26), X, 6); }
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for(let r = Math.floor(z0/B5); r <= Math.floor(z1/B5); r++){ const Y = py((r + .5)*B5); if(Y > 22 && Y < H - 10) g.fillText(String(((r % 100) + 100) % 100).padStart(2, '0'), 6, Y); }
    g.textAlign = 'left';
    // nébuleuses (tranche ±1 cellule de 1 600 u autour du plan de l'étoile courante)
    const ncy = Math.round(cy/NCELL);
    for(let nx = Math.round((x0 - 1500)/NCELL); nx <= Math.round((x1 + 1500)/NCELL); nx++) for(let nz = Math.round((z0 - 1500)/NCELL); nz <= Math.round((z1 + 1500)/NCELL); nz++) for(let ny = ncy - 1; ny <= ncy + 1; ny++){
      const n = nebAt(nx, ny, nz); if(!n) continue; const dy = Math.abs(n.y - cy); if(dy > n.R + 420) continue;
      const X = px(n.x), Y = py(n.z), rp = n.R*k; if(X + rp*1.3 < 0 || X - rp*1.3 > W || Y + rp*1.3 < 0 || Y - rp*1.3 > H) continue;
      const a = clamp(1 - dy/(n.R + 420), .2, 1)*.9;
      g.globalAlpha = a; g.globalCompositeOperation = n.type === 'dark' ? 'source-over' : 'lighter'; g.drawImage(nebSprite(n), X - rp*1.25, Y - rp*1.25, rp*2.5, rp*2.5);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      if(n.type === 'dark'){ g.setLineDash([2, 5]); g.strokeStyle = 'rgba(142,160,196,.3)'; g.beginPath(); g.arc(X, Y, rp*.85, 0, TAU); g.stroke(); g.setLineDash([]); }
      hit(X, Y, rp*.75, n, 0);
      n._px = [X, Y, rp];
    }
    // étoiles : 5 couches de cellules autour du plan de l'étoile courante (±2 cellules), chargées progressivement
    const ix0 = Math.floor(x0/CELL - .6), ix1 = Math.ceil(x1/CELL + .6), iz0 = Math.floor(z0/CELL - .6), iz1 = Math.ceil(z1/CELL + .6), need = [], vis = [];
    for(let iy = cyc - 2; iy <= cyc + 2; iy++) for(let ix = ix0; ix <= ix1; ix++) for(let iz = iz0; iz <= iz1; iz++){
      const kk = ix + ',' + iy + ',' + iz, s = stars.get(kk); if(s === undefined){ need.push([ix, iy, iz, kk]); continue; } if(s) vis.push(s); }
    if(need.length){ const cx = V.x/CELL, cz = V.y/CELL; need.sort((a, b) => (Math.abs(a[0] - cx) + Math.abs(a[2] - cz)) - (Math.abs(b[0] - cx) + Math.abs(b[2] - cz))); queue = need; } else queue = [];
    const cur = starOf(ms.cur.cell), nxt = starOf(ms.next.cell), pend = ms.pending ? starOf(ms.pending.cell) : null;
    placed.push([8, H - 44, 150, 40]);                                                  // barre d'échelle
    [cur, nxt, pend].forEach(s => { if(s && !vis.includes(s)) vis.push(s); });
    // itinéraire parcouru, prochain saut
    const route = ms.route, visited = new Set(route.map(r => r.cell));
    if(route.length > 1){ g.setLineDash([3, 4]); g.strokeStyle = 'rgba(142,160,196,.6)'; g.lineWidth = 1.2; g.beginPath(); route.forEach((r, i) => { const X = px(r.gal[0]), Y = py(r.gal[2]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); g.setLineDash([]); }
    const cX = px(ms.cur.gal[0]), cY = py(ms.cur.gal[2]), nX = px(ms.next.gal[0]), nY = py(ms.next.gal[2]);
    { const dx = nX - cX, dy = nY - cY, L = Math.hypot(dx, dy) || 1, ux = dx/L, uy = dy/L, r0 = 12*zf, r1 = 13*zf;
      g.setLineDash([6, 5]); g.strokeStyle = 'rgba(255,180,84,.85)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cX + ux*r0, cY + uy*r0); g.lineTo(nX - ux*r1, nY - uy*r1); g.stroke(); g.setLineDash([]);
      if(L > 40){ const ax = nX - ux*(r1 + 2), ay = nY - uy*(r1 + 2); g.fillStyle = '#ffb454'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - ux*8 - uy*4, ay - uy*8 + ux*4); g.lineTo(ax - ux*8 + uy*4, ay - uy*8 - ux*4); g.closePath(); g.fill(); } }
    if(pend){ const X = px(pend.x), Y = py(pend.z); g.setLineDash([2, 3]); g.strokeStyle = 'rgba(255,180,84,.7)'; g.beginPath(); g.moveTo(nX, nY); g.lineTo(X, Y); g.stroke(); g.setLineDash([]); }
    // systèmes miniatures (planètes autour des étoiles) quand on s'approche
    const mini = cellPx > 120; let budget = 3;
    // étoiles
    g.globalCompositeOperation = 'lighter';
    const drawn = [];
    vis.forEach(s => { const X = px(s.x), Y = py(s.z); if(X < -30 || X > W + 30 || Y < -30 || Y > H + 30) return;
      const dyc = Math.abs(s.y - cy)/CELL, a = clamp(1 - .2*dyc, .3, 1), sz = (1.1 + .5*clamp(Math.log10(Math.max(s.lum, 1e-4)) + 2, 0, 7))*zf;
      g.globalAlpha = a; g.drawImage(glow(s.col), X - sz*4.5, Y - sz*4.5, sz*9, sz*9);
      drawn.push([s, X, Y, sz, a]); hit(X, Y, Math.max(7, sz*1.7), s, 2); });
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if(mini) drawn.forEach(([s, X, Y, sz, a]) => {
      if(!S.sysSeen.has(s.cell)){ if(budget <= 0){ S.dirty = true; return; } budget--; S.sysSeen.add(s.cell); }   // 3 systèmes calculés par image au plus
      const info = C.systemInfo(s.cell); if(!info) return; const m = sysMap(info), Rm = Math.min(cellPx*.36, 70);
      g.globalAlpha = a*.85; g.lineWidth = 1;
      if(info.belt){ g.setLineDash([1, 3]); g.strokeStyle = 'rgba(142,160,196,.45)'; g.beginPath(); g.arc(X, Y, Rm*(m.f(info.belt[0]) + m.f(info.belt[1]))/2, 0, TAU); g.stroke(); g.setLineDash([]); }
      info.planets.forEach(p => { const r = Rm*m.f(p.a); g.strokeStyle = p.hab ? 'rgba(94,234,212,.28)' : 'rgba(37,55,92,.9)'; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.stroke();
        const c = KCOL[p.kind] || KCOL.continental; g.fillStyle = c[1]; g.beginPath(); g.arc(X + Math.cos(p.ang)*r, Y - Math.sin(p.ang)*r, p.gas ? 2.4 : 1.7, 0, TAU); g.fill(); });
      g.globalAlpha = 1; });
    // anneaux : système courant, prochain saut, saut en attente
    const ring = (X, Y, r, col, dash) => { g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.stroke(); g.setLineDash([]); };
    ring(cX, cY, 11*zf, '#5eead4'); ring(nX, nY, 11*zf, '#ffb454'); g.strokeStyle = 'rgba(255,180,84,.25)'; g.lineWidth = 4; g.beginPath(); g.arc(nX, nY, 11*zf + 3, 0, TAU); g.stroke();
    if(pend) ring(px(pend.x), py(pend.z), 11*zf, '#ffb454', [2, 3]);
    // héros : au système courant, ou sur la ligne pendant la distorsion
    const nShips = (liveShips() || []).length;
    if(ms.phase === 'warp' && ms.progress > 0){ const hX = px(ms.gal[0]), hY = py(ms.gal[2]); chevron(g, hX, hY, Math.atan2(nY - cY, nX - cX), 6, '#ffb454'); label(g, placed, ms.hero.name, hX, hY, F(10), '#ffb454', true, 'WARP · ' + Math.round(ms.progress*100) + ' %', '#ffb454'); }
    else chevron(g, cX + 15*zf, cY - 15*zf, -Math.PI/4, 5, '#ffb454');
    // étiquettes : repères d'abord, puis étoiles de l'itinéraire, puis les plus lumineuses
    const dLy = s => fmtLy(Math.hypot(s.x - ms.cur.gal[0], s.y - ms.cur.gal[1], s.z - ms.cur.gal[2]));
    label(g, placed, ms.cur.name, cX, cY, F(11, 700), '#e8edf5', true, 'CURRENT · ' + nShips + ' ship' + (nShips > 1 ? 's' : ''), '#5eead4');
    const vy = ms.next.gal[1] - ms.cur.gal[1], vtxt = Math.abs(vy) > CELL*.8 ? ' (' + (vy > 0 ? '↑ ' : '↓ ') + fmtLy(Math.abs(vy)) + ')' : '';   // hors du plan : au-dessus / au-dessous
    label(g, placed, ms.next.name, nX, nY, F(11, 700), '#e8edf5', true, 'NEXT JUMP · ' + fmtLy(Math.hypot(ms.next.gal[0] - ms.cur.gal[0], vy, ms.next.gal[2] - ms.cur.gal[2])) + vtxt, '#ffb454');
    if(pend) label(g, placed, pend.name, px(pend.x), py(pend.z), F(10, 700), '#e8edf5', true, 'QUEUED · after the jump', '#ffb454');
    const hs = S.hov && S.hov.kind === 'star' ? S.hov : null, ss = S.sel && S.sel.kind === 'star' ? S.sel : null;
    [ss, hs].forEach(s => { if(s && s !== cur && s !== nxt && s !== pend) label(g, placed, s.name, px(s.x), py(s.z), F(10.5, 700), '#ffb454', true, s.des + ' · ' + dLy(s), '#8ea0c4'); });
    const maxL = Math.round(W*H/15000);
    drawn.filter(d => visited.has(d[0].cell) && d[0] !== cur).forEach(d => label(g, placed, d[0].name, d[1], d[2], F(10), '#8ea0c4', false));
    drawn.slice().sort((a, b) => b[0].lum*b[4] - a[0].lum*a[4]).slice(0, maxL).forEach(d => { if(d[0] !== cur && d[0] !== nxt && d[0] !== pend) label(g, placed, d[0].name, d[1], d[2], F(10), 'rgba(232,237,245,' + (.45 + .5*d[4]) + ')', false); });
    nebLabels(g, placed);
    // échelle
    const target = 110/k, ly = lyOf(target), p10 = Math.pow(10, Math.floor(Math.log10(ly))), nice = [1, 2, 5, 10].map(x => x*p10).filter(x => x <= ly*1.3).pop() || p10;
    S.scale = { px: nice/lyOf(1)*k, text: num(nice) + ' ly · ' + num(nice*.30660) + ' pc' };
    S.legend = 'TOP VIEW · SLICE ±' + num(lyOf(2.5*CELL)) + ' ly' + (queue.length ? ' · LOADING…' : '');
  }
  function nebLabels(g, placed){ nebs.forEach(n => { if(!n || !n._px) return; const [X, Y, rp] = n._px; n._px = null; if(rp < 26 || X < 0 || X > S.W || Y < 0 || Y > S.H) return;
    g.font = 'italic ' + F(10); const t = n.name + ' Nebula', w = g.measureText(t).width; if(placed.some(r => X - w/2 < r[0] + r[2] && X + w/2 > r[0] && Y - 6 < r[1] + r[3] && Y + 6 > r[1])) return;
    g.globalAlpha = .75; g.textBaseline = 'middle'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(5,8,15,.7)'; g.strokeText(t, X, Y); g.fillStyle = '#b9c4dc'; g.fillText(t, X, Y);
    g.textAlign = 'left'; g.globalAlpha = 1; placed.push([X - w/2, Y - 6, w, 12]); }); }

  function drawSystem(g, W, H){
    const info = C.systemInfo(S.cell); if(!info) return; const m = sysMap(info), V = S.v, k = V.k, ms = S.ms, placed = [];
    const cur = info.cell === ms.cur.cell, zf = clamp(Math.pow(k/base(), .35), .85, 2.4);
    const Ox = W/2 - V.x*k, Oy = H/2 - V.y*k, Rp = r => m.f(r)*k;
    const P = (r, ang) => { const u = m.f(r); return [Ox + u*Math.cos(ang)*k, Oy - u*Math.sin(ang)*k]; };
    // zone habitable
    const h0 = Rp(info.hz[0]), h1 = Rp(info.hz[1]);
    g.fillStyle = 'rgba(94,234,212,.05)'; g.beginPath(); g.arc(Ox, Oy, h1, 0, TAU); g.arc(Ox, Oy, h0, 0, TAU, true); g.fill();
    g.setLineDash([2, 5]); g.strokeStyle = 'rgba(94,234,212,.24)'; g.lineWidth = 1; g.beginPath(); g.arc(Ox, Oy, h0, 0, TAU); g.stroke(); g.beginPath(); g.arc(Ox, Oy, h1, 0, TAU); g.stroke(); g.setLineDash([]);

    // ceinture d'astéroïdes
    if(info.belt){ const b0 = Rp(info.belt[0]), b1 = Rp(info.belt[1]); g.fillStyle = 'rgba(142,160,196,.045)'; g.beginPath(); g.arc(Ox, Oy, b1, 0, TAU); g.arc(Ox, Oy, b0, 0, TAU, true); g.fill();
      g.fillStyle = '#8ea0c4'; beltSpecks(info).forEach(s => { const X = Ox + s[0]*k, Y = Oy + s[1]*k; if(X < 0 || X > W || Y < 0 || Y > H) return; g.globalAlpha = s[2]; g.fillRect(X, Y, 1.3, 1.3); }); g.globalAlpha = 1;
      S.hits.push({ ring: true, x: Ox, y: Oy, r0: b0, r1: b1, o: { kind: 'belt', cell: info.cell, name: 'Asteroid belt', a0: info.belt[0], a1: info.belt[1] }, pri: 1 });
    }
    // orbites
    const selI = S.sel && S.sel.kind === 'planet' && S.sel.cell === info.cell ? S.sel.i : -1;
    info.planets.forEach(p => { g.strokeStyle = p.i === selI ? 'rgba(255,180,84,.55)' : (p.hab ? 'rgba(94,234,212,.35)' : 'rgba(37,55,92,.95)'); g.lineWidth = 1; g.beginPath(); g.arc(Ox, Oy, Rp(p.a), 0, TAU); g.stroke(); });
    // direction du prochain saut (système courant)
    if(cur){ const B = info.basis, t = ms.toNext, a = Math.atan2(dot(t, B.l), dot(t, B.s)), ca = Math.cos(a), sa = -Math.sin(a);
      const edge = Math.min(ca > 0 ? (W - 60 - Ox)/ca : ca < 0 ? (60 - Ox)/ca : 1e9, sa > 0 ? (H - 30 - Oy)/sa : sa < 0 ? (30 - Oy)/sa : 1e9);   // bord de la vue
      const r1 = clamp(k*1.18, 30, Math.max(30, edge)), r0 = Math.min(k*1.02, r1 - 24);
      g.setLineDash([6, 5]); g.strokeStyle = 'rgba(255,180,84,.8)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(Ox + Math.cos(a)*r0, Oy - Math.sin(a)*r0); g.lineTo(Ox + Math.cos(a)*r1, Oy - Math.sin(a)*r1); g.stroke(); g.setLineDash([]);
      const ex = Ox + Math.cos(a)*r1, ey = Oy - Math.sin(a)*r1; chevron(g, ex, ey, -a, 5, '#ffb454'); label(g, placed, 'NEXT JUMP → ' + ms.next.name, ex, ey, F(9.5), '#ffb454', false); }
    // étoile
    const sr = 7*zf; g.globalCompositeOperation = 'lighter'; g.drawImage(glow(info.color), Ox - sr*5, Oy - sr*5, sr*10, sr*10); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgb(' + rgb(info.color.map(c => .55 + .45*c)) + ')'; g.beginPath(); g.arc(Ox, Oy, sr*.55, 0, TAU); g.fill();
    const starO = starOf(info.cell); hit(Ox, Oy, sr, starO, 2);
    label(g, placed, info.name, Ox, Oy, F(11, 700), '#e8edf5', true, info.designation, '#8ea0c4');
    // planètes (lunes en points), grappes de vaisseaux
    const ships = cur ? liveShips() : [], groups = new Map(), loose = [];
    ships.forEach(s => { const np = nearestPlanet(info, s.pos); if(np.p && np.d < np.p.R*300){ if(!groups.has(np.p.i)) groups.set(np.p.i, []); groups.get(np.p.i).push(s); } else loose.push(s); });
    info.planets.forEach(p => { const [X, Y] = P(p.a, p.ang), pr = (p.gas ? 8.5 + p.R/2e7 : 4.6 + p.R/4e6)*zf, la = Math.atan2(Oy - Y, Ox - X);
      if(p.rings) ringArc(g, X, Y, pr, false); disc(g, X, Y, pr, p, la); if(p.rings) ringArc(g, X, Y, pr, true);
      const moons = cur ? liveMoons(p.i) : null, B = info.basis, nm = moons ? moons.length : p.moons;
      for(let j = 0; j < nm; j++){ let a = j*2.4 + p.i; if(moons){ const r = moons[j].rel; a = Math.atan2(dot(r, B.l), dot(r, B.s)); } const d = pr + 4 + j*2.6;
        g.fillStyle = '#9aa6b8'; g.beginPath(); g.arc(X + Math.cos(a)*d, Y - Math.sin(a)*d, 1.2, 0, TAU); g.fill(); }
      const grp = groups.get(p.i) || [], hero = grp.find(s => s.hero);
      grp.forEach((s, j) => { const a = -Math.PI/2 + (j - (grp.length - 1)/2)*.32, d = pr + 7 + (p.moons ? 3 : 0); g.fillStyle = s.hero ? '#ffb454' : '#5eead4'; g.fillRect(X + Math.cos(a)*d - 1.3, Y + Math.sin(a)*d - 1.3, 2.6, 2.6); });
      hit(X, Y, pr + 3, Object.assign({}, p, { kind: 'planet', pkind: p.kind, cell: info.cell, nShips: grp.length }), 3);
      label(g, placed, p.name, X + pr*.6, Y, F(10.5, p.hab ? 700 : 400), '#e8edf5', true, (KIND_T(p.kind)) + (grp.length ? ' · ' + grp.length + ' ship' + (grp.length > 1 ? 's' : '') : ''), grp.length ? '#5eead4' : '#5d6f92');
      if(hero) label(g, placed, '▲ ' + hero.name, X, Y - pr - 10, F(9.5), '#ffb454', false); });
    // vaisseaux en transit (hors des orbites planétaires)
    loose.forEach(s => { const r = Math.hypot(s.pos[0], s.pos[1], s.pos[2]), a = Math.atan2(dot(s.pos, info.basis.l), dot(s.pos, info.basis.s)), [X, Y] = P(r, a);
      const fa = Math.atan2(-dot(s.fwd, info.basis.l), dot(s.fwd, info.basis.s)); chevron(g, X, Y, fa, s.craft ? 3.5 : 5, s.hero ? '#ffb454' : '#5eead4');
      hit(X, Y, 7, Object.assign({ kind: 'ship' }, s), 5); label(g, placed, s.name, X, Y, F(9.5), s.hero ? '#ffb454' : '#b9c4dc', s.hero, s.hero ? s.type : null); });
    // étiquettes d'anneaux (zone habitable, ceinture) : premier emplacement libre sur le cercle
    const ringLabel = (t, r, col) => { if(r < 30) return; g.font = F(9); const w = g.measureText(t).width;
      for(const a of [Math.PI/2, -Math.PI/2, Math.PI*.3, -Math.PI*.3, Math.PI*.7, -Math.PI*.7, 0, Math.PI]){ const x = Ox + Math.cos(a)*r - w/2, y = Oy - Math.sin(a)*r - 5;
        if(x < 4 || x + w > W - 40 || y < 4 || y > H - 14 || placed.some(q => x < q[0] + q[2] && x + w > q[0] && y < q[1] + q[3] && y + 10 > q[1])) continue;
        placed.push([x, y, w, 10]); g.textBaseline = 'top'; g.lineWidth = 3; g.strokeStyle = 'rgba(5,8,15,.8)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); return; } };
    if(h1 - h0 > 8) ringLabel('HABITABLE ZONE', (h0 + h1)/2, 'rgba(94,234,212,.75)');
    if(info.belt) ringLabel('ASTEROID BELT', (Rp(info.belt[0]) + Rp(info.belt[1]))/2, 'rgba(142,160,196,.85)');
    S.scale = null; S.legend = 'LOG SCALE · OUTER ORBIT ' + fmtAU(m.rMax/1.12);
  }

  function drawPlanet(g, W, H){
    const info = C.systemInfo(S.cell); if(!info) return; const p = info.planets[S.pi]; if(!p) return;
    const V = S.v, k = V.k, ms = S.ms, cur = info.cell === ms.cur.cell, B = info.basis, pp = planetPos(info, p), placed = [], R = p.R;
    const ships = cur ? liveShips().map(s => { const rel = [s.pos[0] - pp[0], s.pos[1] - pp[1], s.pos[2] - pp[2]]; return Object.assign({ rel, d: Math.hypot(rel[0], rel[1], rel[2]) }, s); }).filter(s => s.d < R*600) : [];
    const moons = cur ? liveMoons(p.i).map(mo => Object.assign({ real: true }, mo)) : Array.from({ length: p.moons }, (_, j) => { const d = R*(p.gas ? 8.5 + 6*j : 29 + 20*j), a = j*2.4 + 1; return { k: j, name: p.name + ' ' + 'abcdef'[j], R: R*(p.gas ? .03 : .22), d, rel: [B.s[0]*Math.cos(a)*d + B.l[0]*Math.sin(a)*d, B.s[1]*Math.cos(a)*d + B.l[1]*Math.sin(a)*d, B.s[2]*Math.cos(a)*d + B.l[2]*Math.sin(a)*d] }; });
    let hMax = R*.2; moons.forEach(mo => hMax = Math.max(hMax, (mo.d - R)*1.12)); ships.forEach(s => hMax = Math.max(hMax, (s.d - R)*1.25));
    const h0 = R*.02, Lh = Math.log(1 + hMax/h0), gm = d => .16 + .84*Math.log(1 + Math.max(0, d - R)/h0)/Lh;
    const Ox = W/2 - V.x*k, Oy = H/2 - V.y*k;
    const at = (rel, d) => { const a = Math.atan2(dot(rel, B.l), dot(rel, B.s)), u = gm(d); return [Ox + Math.cos(a)*u*k, Oy - Math.sin(a)*u*k]; };
    // anneaux d'altitude (repères réels)
    g.font = F(9); g.textAlign = 'center';
    [1e5, 1e6, 1e7, 1e8, 1e9, 1e10].forEach(h => { if(h > hMax*.95) return; const r = gm(R + h)*k; if(r - .16*k < 12) return;
      g.setLineDash([2, 6]); g.strokeStyle = 'rgba(37,55,92,.9)'; g.lineWidth = 1; g.beginPath(); g.arc(Ox, Oy, r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(93,111,146,.9)'; g.fillText('alt ' + C.fmtU(h).replace(/\.0+ /, ' '), Ox, Oy - r - 7); placed.push([Ox - 30, Oy - r - 12, 60, 11]); });
    g.textAlign = 'left';
    // planète, éclairée côté étoile
    const la = Math.atan2(Math.sin(p.ang), -Math.cos(p.ang)), pr = .16*k;
    placed.push([Ox - pr, Oy - pr, 2*pr, 2*pr]);                                          // les étiquettes contournent la planète
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.moveTo(Ox + Math.cos(la + Math.PI/2)*pr, Oy + Math.sin(la + Math.PI/2)*pr);        // cône d'ombre
    g.lineTo(Ox - Math.cos(la)*k*1.2 + Math.cos(la + Math.PI/2)*pr*.6, Oy - Math.sin(la)*k*1.2 + Math.sin(la + Math.PI/2)*pr*.6); g.lineTo(Ox - Math.cos(la)*k*1.2 - Math.cos(la + Math.PI/2)*pr*.6, Oy - Math.sin(la)*k*1.2 - Math.sin(la + Math.PI/2)*pr*.6);
    g.lineTo(Ox - Math.cos(la + Math.PI/2)*pr, Oy - Math.sin(la + Math.PI/2)*pr); g.closePath(); g.fill();
    if(p.rings) ringArc(g, Ox, Oy, pr, false); disc(g, Ox, Oy, pr, p, la); if(p.rings) ringArc(g, Ox, Oy, pr, true);
    hit(Ox, Oy, pr, Object.assign({}, p, { kind: 'planet', pkind: p.kind, cell: info.cell, nShips: ships.length }), 3);
    label(g, placed, p.name, Ox + pr*.72, Oy - pr*.72, F(12, 700), '#e8edf5', true, (KIND_T(p.kind)) + ' · R ' + fmtKm(R), '#8ea0c4');
    // lunes
    moons.forEach(mo => { const r = gm(mo.d)*k, [X, Y] = at(mo.rel, mo.d), mr = clamp(2.5 + mo.R/R*14, 2.5, 8)*clamp(Math.pow(k/base(), .3), .9, 2);
      g.strokeStyle = 'rgba(37,55,92,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(Ox, Oy, r, 0, TAU); g.stroke();
      const gr = g.createRadialGradient(X + Math.cos(la)*mr*.4, Y + Math.sin(la)*mr*.4, mr*.1, X, Y, mr); gr.addColorStop(0, '#c9ced6'); gr.addColorStop(1, '#3d434d'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, mr, 0, TAU); g.fill();
      hit(X, Y, mr + 3, { kind: 'moon', cell: info.cell, i: p.i, k: mo.k, name: mo.name, R: mo.R, d: mo.d, parent: p.name, real: !!mo.real }, 3);
      label(g, placed, mo.name, X, Y, F(9.5), '#b9c4dc', false, C.fmtU(mo.d - R) + ' up', '#5d6f92'); });
    // vaisseaux : trace d'orbite discrète, chevron orienté, étiquette nom + immatriculation + altitude
    g.lineWidth = 1; ships.forEach(s => { if(s.craft) return; g.strokeStyle = s.hero ? 'rgba(255,180,84,.28)' : 'rgba(94,234,212,.12)'; g.beginPath(); g.arc(Ox, Oy, gm(s.d)*k, 0, TAU); g.stroke(); });
    ships.sort((a, b) => (b.hero - a.hero) || (a.d - b.d)).forEach(s => { const [X, Y] = at(s.rel, s.d), fa = Math.atan2(-dot(s.fwd, B.l), dot(s.fwd, B.s));
      chevron(g, X, Y, fa, s.craft ? 3.6 : 5.2, s.hero ? '#ffb454' : (s.craft ? '#8ea0c4' : '#5eead4'));
      hit(X, Y, 7, Object.assign({ kind: 'ship' }, s), 5);
      label(g, placed, s.name, X, Y, F(9.5, s.hero ? 700 : 400), s.hero ? '#ffb454' : '#d5dcea', s.hero, s.reg + ' · ' + C.fmtU(s.d - R) + ' up', '#5d6f92'); });
    if(!cur) { g.font = F(10); g.fillStyle = '#5d6f92'; g.fillText('Ships are only tracked in the current system.', 14, H - 20); }
    S.scale = null; S.legend = 'LOG SCALE · ALTITUDE · ' + (cur ? ships.length + ' SHIPS IN ORBIT' : 'NOT VISITED');
  }

  function draw(now){
    const g = ctx, W = S.W, H = S.H; g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); g.clearRect(0, 0, W, H); S.hits = [];
    let tr = S.trans, e = 1; if(tr){ e = clamp((now - tr.t0)/tr.dur, 0, 1); if(e >= 1){ S.trans = tr = null; e = 1; } }
    g.save();
    if(tr){ const s = tr.inward ? .45 + .55*ease(e) : 1.8 - .8*ease(e); g.globalAlpha = ease(e); g.translate(tr.fx, tr.fy); g.scale(s, s); g.translate(-tr.fx, -tr.fy); }
    try { if(S.level === 'sector') drawSector(g, W, H); else if(S.level === 'system') drawSystem(g, W, H); else drawPlanet(g, W, H); } catch(err){ console.error(err); }
    g.restore();
    if(tr){ g.save(); const s = tr.inward ? 1 + 2.2*ease(e) : 1 - .55*ease(e); g.globalAlpha = 1 - ease(e); g.translate(tr.fx, tr.fy); g.scale(s, s); g.translate(-tr.fx, -tr.fy); g.drawImage(snap, 0, 0, W, H); g.restore(); }
    // survol et sélection
    if(!tr){ const find = o => o && S.hits.find(h => !h.ring && okey(h.o) === okey(o));
      const hh = find(S.hov); if(hh && okey(S.hov) !== okey(S.sel)){ g.strokeStyle = 'rgba(232,237,245,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(hh.x, hh.y, hh.r + 4, 0, TAU); g.stroke(); }
      const hs = find(S.sel); if(hs) brackets(g, hs.x, hs.y, hs.r + 6, '#ffb454'); }
    // barre d'échelle
    if(S.scale){ const x = 14, y = H - 16, w = S.scale.px; g.strokeStyle = '#8ea0c4'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y - 4); g.stroke();
      g.font = F(9.5); g.fillStyle = '#8ea0c4'; g.textBaseline = 'bottom'; g.fillText(S.scale.text, x, y - 6); }
    const sc = $('.leg .sc'), lg = trm(S.legend || ''); if(sc.textContent !== lg) sc.textContent = lg;
  }

  /* ---------- panneau latéral : fiche de la cible, voyage ---------- */
  function okey(o){ return o ? o.kind + ':' + (o.cell || o.key || o.uid || '') + ':' + (o.i != null ? o.i : '') + ':' + (o.k != null ? o.k : '') : ''; }
  const ln = (a, b) => '<div class="ln"><span>' + a + '</span><b>' + b + '</b></div>';
  function panel(){
    const o = S.sel, info = $('.info'), acts = $('.acts'), ms = S.ms; $('.msg').textContent = '';
    if(!o){ info.innerHTML = trm('<div class="empty">No target — click a star, planet, ship or nebula.<br>Zoom in on a star to open its system.</div>'); acts.innerHTML = ''; return; }
    let h = '', a = '';
    const btn = (t, act, cls, dis) => '<button type="button" class="go' + (cls ? ' ' + cls : '') + '" data-a="' + act + '"' + (dis ? ' disabled' : '') + '>' + t + '</button>';
    if(o.kind === 'star'){
      const si = C.systemInfo(o.cell), isCur = o.cell === ms.cur.cell, isNext = o.cell === ms.next.cell, isPend = ms.pending && o.cell === ms.pending.cell, vis = ms.route.some(r => r.cell === o.cell);
      h = '<div class="nm' + (isNext ? ' a' : '') + '">' + esc(o.name) + '</div>' + (isCur ? '<span class="tag c">CURRENT</span>' : '') + (isNext ? '<span class="tag a">NEXT JUMP</span>' : '') + (isPend ? '<span class="tag a">QUEUED</span>' : '') + (vis && !isCur ? '<span class="tag m">VISITED</span>' : '') +
        ln('Class', esc(o.des)) + ln('Luminosity', (o.lum < .01 ? o.lum.toPrecision(2) : num(o.lum)) + ' L☉') + ln('Temperature', Math.round(o.temp) + ' K') + (isCur ? '' : ln('Distance', fmtLy(Math.hypot(o.x - ms.cur.gal[0], o.y - ms.cur.gal[1], o.z - ms.cur.gal[2])))) +
        (si ? ln('Planets', si.planets.length + (si.belt ? ' + belt' : '')) + ln('Habitable', esc(si.planets.filter(p => p.hab).map(p => p.name).join(', ') || '—')) : '');
      a = isCur ? '' : btn(isNext ? 'ALREADY THE NEXT JUMP' : '▶ SET AS NEXT JUMP', 'go', '', isNext);
      a += btn('OPEN SYSTEM ›', 'sys', 'g2');
      if(!isCur && !isNext && !ms.canRetarget) h += '<div class="msg" style="display:block">Departure under way: applies to the jump after.</div>';
    } else if(o.kind === 'nebula'){
      const loaded = C.nebulaLoaded(o.key);
      h = '<div class="nm">' + esc(o.name) + ' Nebula</div><span class="tag m">' + esc((NEB_EN[o.type] || o.type).toUpperCase()) + '</span>' + ln('Diameter', fmtLy(o.R*2)) + ln('Distance', fmtLy(Math.max(0, Math.hypot(o.x - ms.cur.gal[0], o.y - ms.cur.gal[1], o.z - ms.cur.gal[2]) - o.R)));
      a = btn('▶ JUMP TO THE NEAREST STAR', 'go');
    } else if(o.kind === 'planet'){
      const isCur = o.cell === ms.cur.cell, isNext = o.cell === ms.next.cell;
      h = '<div class="nm">' + esc(o.name) + '</div>' + (o.hab ? '<span class="tag c">HABITABLE</span>' : '') + (o.rings ? '<span class="tag m">RINGS</span>' : '') +
        ln('Type', KIND_T(o.pkind)) + ln('Radius', fmtKm(o.R)) + ln('Orbit', fmtAU(o.a) + ' · ' + C.fmtU(o.a)) + ln('Moons', o.moons) + (isCur ? ln('Ships in orbit', o.nShips || 0) : '');
      a = isCur ? '' : (isNext ? btn('ALREADY THE NEXT JUMP', 'go', '', true) : btn('▶ JUMP HERE', 'go'));
      if(S.level === 'system') a += btn('ORBIT VIEW ›', 'orb', 'g2');
    } else if(o.kind === 'moon'){
      h = '<div class="nm">' + esc(o.name) + '</div><span class="tag m">MOON OF ' + esc(o.parent.toUpperCase()) + '</span>' + ln('Radius', fmtKm(o.R)) + ln('Distance', C.fmtU(o.d));
      a = o.real ? '' : btn('▶ JUMP TO THIS SYSTEM', 'go');
    } else if(o.kind === 'belt'){
      const isCur = o.cell === ms.cur.cell;
      h = '<div class="nm">Asteroid belt</div>' + ln('Inner edge', fmtAU(o.a0)) + ln('Outer edge', fmtAU(o.a1));
      a = isCur ? '' : btn('▶ JUMP TO THIS SYSTEM', 'go');
    } else if(o.kind === 'ship'){
      const all = liveShips(), s = all.find(x => x.uid === o.uid) || o, hero = all.find(x => x.hero);
      h = '<div class="nm' + (s.hero ? ' a' : '') + '">' + esc(s.name) + '</div>' + (s.hero ? '<span class="tag a">HERO</span>' : '') + (s.subj ? '<span class="tag c">ON SCREEN</span>' : '') +
        ln('Type', esc(s.type)) + ln('Registration', esc(s.reg)) + ln('Length', Math.round(s.len) + ' m') + (hero && !s.hero ? ln('From the hero', C.fmtU(dist3(hero.pos, s.pos))) : '') + ln('Phase', esc(s.seg));
      a = '';
    }
    info.innerHTML = trm(h); acts.innerHTML = trm(a);
  }
  $('.acts').addEventListener('click', e => { const b = e.target.closest('button'); if(!b || b.disabled || !S.sel) return;
    if(b.dataset.a === 'go') act(S.sel);
    else if(b.dataset.a === 'sys'){ const s = S.sel; enterSystem(s.cell, S.W/2, S.H/2); }
    else if(b.dataset.a === 'orb'){ const s = S.sel, h = S.hits.find(x => x.o && okey(x.o) === okey(s)); enterPlanet(s.i, h ? h.x : S.W/2, h ? h.y : S.H/2); } });
  const PH = { arrival: 'arrival', orbit: 'in orbit', departure: 'departing', jump: 'quantum jump', warp: 'superluminal' };
  function voyage(){ const ms = S.ms; if(!ms) return;
    const d = Math.hypot(ms.next.gal[0] - ms.cur.gal[0], ms.next.gal[1] - ms.cur.gal[1], ms.next.gal[2] - ms.cur.gal[2]);
    const h = ln('Hero', esc(ms.hero.name)) + ln('', esc(ms.hero.type) + ' · ' + esc(ms.hero.reg)) + ln('At', esc(ms.cur.name) + ' · ' + PH[ms.phase]) +
      ln('Next', esc(ms.next.name) + ' · ' + fmtLy(d)) + ln('', (ms.mode === 'warp' ? 'warp drive' : ms.mode === 'local' ? 'local trade' : 'quantum jump') + (ms.tLeft != null && (ms.phase === 'arrival' || ms.phase === 'orbit' || ms.phase === 'departure') ? ' · in ' + Math.ceil(ms.tLeft) + ' s' : '')) +
      (ms.pending ? ln('Queued', esc(ms.pending.name)) : '');
    if(h !== S.voyHtml){ S.voyHtml = h; $('.vinfo').innerHTML = trm(h); } }

  /* ---------- actions ---------- */
  function toTarget(o){ if(o.kind === 'nebula') return { kind: 'nebula', key: o.key, gal: [o.x, o.y, o.z] };
    if(o.kind === 'ship') return { kind: 'ship', uid: o.uid };
    return { kind: o.kind, cell: o.cell, i: o.i, k: o.k }; }
  function act(o){
    if(!o) return;
    S.ms = C.mapState();
    const r = C.focus(toTarget(o)), nm = esc(o.kind === 'nebula' ? o.name + ' Nebula' : o.name || '');
    const msg = t => { $('.msg').textContent = trm(t); };
    if(r === 'busy') return msg('Jump sequence under way — the camera stays on the ship. Try again after the jump.');
    if(r === 'next:locked') return msg('Quantum jump module required (port services).');
    if(r === 'next:range') return msg('Out of jump range: the 24 nearest stars only.');
    if(r === 'next:fuel') return msg('Not enough fuel for this jump.');
    if(r === 'none') return msg('Objects of the current system have no action.');
    if(r === 'next:invalid') return msg('Not available right now.');
    const star = o.kind === 'star' ? o.name : (C.systemInfo(o.cell) || {}).name;
    let html;
    if(r === 'vista' || r === 'shot') html = '<span class="a">CAMERA</span> · ' + nm;
    else if(r.indexOf('next:') === 0){
      const p = r.split(':'), what = p[2] ? esc(p[2]) + ' <span class="c">(near ' + nm + ')</span>' : esc(star) + (o.kind === 'planet' ? ' <span class="c">· arrival at ' + nm + '</span>' : '');
      if(p[1] === 'now') html = '<span class="a">NEXT JUMP</span> · ' + what + ' <span class="c">— departure re-planned</span>';
      else if(p[1] === 'next') html = '<span class="a">NEXT JUMP</span> · ' + what + ' <span class="c">— after the current jump</span>';
      else if(p[1] === 'same') html = '<span class="a">NEXT JUMP</span> · ' + what + ' <span class="c">— already planned</span>';
      else html = '<span class="a">' + esc(star) + '</span> <span class="c">is the current system</span>';
    } else html = esc(r);
    if(window.__DEMO && __DEMO.toast) __DEMO.toast(trm(html));
    close();
  }

  /* ---------- entrées : glisser, pincer, molette, clic, double-clic (souris et toucher) ---------- */
  const ptrs = new Map(); let drag = null, pinch = null, lastTap = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hitAt(x, y, touch){ const tol = touch ? 14 : 5; let best = null, bs = -Infinity;
    for(const h of S.hits){ let d; if(h.ring){ const dd = Math.hypot(x - h.x, y - h.y); if(dd < h.r0 - tol || dd > h.r1 + tol) continue; d = 0; } else { d = Math.hypot(x - h.x, y - h.y); if(d > h.r + tol) continue; }
      const sc = h.pri*1000 - d; if(sc > bs){ bs = sc; best = h; } }
    return best; }
  const pinchState = () => { const a = [...ptrs.values()]; return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, x: (a[0].x + a[1].x)/2, y: (a[0].y + a[1].y)/2 }; };
  cv.addEventListener('pointerdown', e => { if(e.button > 0) return; try { cv.setPointerCapture(e.pointerId); } catch(_){} ptrs.set(e.pointerId, pos(e));
    if(ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== 'mouse' }; else { if(drag) drag.moved = true; pinch = pinchState(); }
    e.preventDefault(); });
  cv.addEventListener('pointermove', e => { const p = pos(e);
    if(!ptrs.has(e.pointerId)){ if(e.pointerType === 'mouse' && !S.trans){ const h = hitAt(p.x, p.y, false), o = h ? h.o : null; if(okey(o) !== okey(S.hov)){ S.hov = o; S.dirty = true; cv.classList.toggle('pt', !!o); } } return; }
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if(ptrs.size >= 2){ const ps = pinchState(); if(pinch){ pan(ps.x - pinch.x, ps.y - pinch.y); zoomBy(ps.d/pinch.d, ps.x, ps.y); } pinch = ps; return; }
    if(drag){ if(!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5){ drag.moved = true; cv.classList.add('dr'); } if(drag.moved) pan(p.x - prev.x, p.y - prev.y); } });
  const endPtr = e => { const p = pos(e), had = ptrs.delete(e.pointerId); if(ptrs.size < 2) pinch = null; cv.classList.remove('dr');
    if(had && ptrs.size === 0){ if(drag && !drag.moved && e.type === 'pointerup') tap(p, drag.touch); drag = null; } };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', () => { if(S.hov && !ptrs.size){ S.hov = null; S.dirty = true; cv.classList.remove('pt'); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomBy(Math.exp(-e.deltaY*(e.deltaMode === 1 ? .05 : e.deltaMode === 2 ? .6 : .0016)), p.x, p.y); }, { passive: false });
  function tap(p, touch){ if(S.trans) return; const h = hitAt(p.x, p.y, touch), o = h ? h.o : null, now = performance.now();
    if(lastTap && o && now - lastTap.t < 420 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24 && lastTap.key === okey(o)){ lastTap = null; S.sel = o; act(o); return; }
    lastTap = { t: now, x: p.x, y: p.y, key: okey(o) };
    S.sel = o; panel(); S.dirty = true; }
  root.querySelector('.zm').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; const z = b.dataset.z; if(z === 'in') zoomBy(1.4); else if(z === 'out') zoomBy(1/1.4); else home(); });
  root.querySelector('.x').addEventListener('click', () => close());
  root.addEventListener('click', e => { if(e.target === root) close(); });

  /* ---------- ouverture, boucle, clavier ---------- */
  function open(){
    if(S.open) return; S.open = true; root.classList.add('on'); root.setAttribute('aria-hidden', 'false');
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    S.ms = C.mapState(); S.live = null; resize();
    if(S.first){ S.first = false; goSector(S.ms.cur.gal, S.W/1500); }
    else if(S.level !== 'sector' && !C.systemInfo(S.cell)) goSector(S.ms.cur.gal, S.W/1500);
    else crumb();
    if(S.sel && S.sel.kind === 'ship' && !liveShips().some(s => s.uid === S.sel.uid)) S.sel = null;
    panel(); voyage(); S.dirty = true; S.warm = true; S.lastLive = performance.now();
  }
  function close(){ if(!S.open) return; S.open = false; S.trans = null; ptrs.clear(); drag = pinch = null; root.classList.remove('on'); root.setAttribute('aria-hidden', 'true'); }
  function frame(now){
    if(!S.open) return;
    if(queue.length){ loadSome(4); if(!queue.length || now - S.lastLoad > 120){ S.lastLoad = now; S.dirty = true; } }
    const liveCur = S.level !== 'sector' && S.cell === (S.ms && S.ms.cur.cell);
    if(now - S.lastLive > (liveCur || (S.ms && S.ms.phase === 'warp') ? 200 : 1000)){ S.lastLive = now; S.ms = C.mapState(); S.dirty = true; voyage(); if(S.sel && S.sel.kind === 'ship') panel(); }
    if(S.trans || S.dirty){ S.dirty = false; draw(now); if(S.level === 'sector' && queue.length && S.warm){ S.warm = false; loadSome(45); draw(now); } }
  }
  function key(e){
    if(!S.open) return false; const k = e.key;
    if(k === 'Escape' || k === 'm' || k === 'M'){ close(); return true; }
    if(k === '+' || k === '='){ zoomBy(1.3); return true; }
    if(k === '-' || k === '_'){ zoomBy(1/1.3); return true; }
    if(k.indexOf('Arrow') === 0){ const d = 70; pan(k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0); return true; }
    if(k === 'Enter'){ if(S.sel) act(S.sel); return true; }
    if(k === 'Backspace'){ tryRise(); return true; }
    if(k === 'c' || k === 'C' || k === 'Home'){ home(); return true; }
    return false;
  }
  window.__STARMAP = { open, close, toggle(){ S.open ? close() : open(); return S.open; }, isOpen: () => S.open, frame, key,
    debug: () => ({ level: S.level, cell: S.cell, pi: S.pi, v: S.v, hits: S.hits.length, stars: stars.size, queue: queue.length, nebs: nebs.size, sel: okey(S.sel) }),
    _hits: () => S.hits.map(h => ({ x: h.x, y: h.y, r: h.r, ring: !!h.ring, kind: h.o && h.o.kind, key: okey(h.o), name: h.o && h.o.name })),
    _set: (o) => { Object.assign(S, o); S.dirty = true; crumb(); }, _draw: () => draw(performance.now()) };
})();
