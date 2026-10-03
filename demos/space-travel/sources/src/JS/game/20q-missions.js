/* =========================================================================
   MISSIONS — lot M1 (spec-missions.md) : système de missions AUTONOME
   - plus d'itinéraire : la partie commence en orbite près d'une planète dotée d'un port ; le contrôle
     appelle ; le TABLEAU DES MISSIONS s'ouvre ; après chaque livraison, celui du port d'arrivée prend le relais ;
   - 5 natures de fret, couleur des conteneurs = nature (denrées orange, équipements vert, armes rouge,
     minerais gris foncé, eau bleu ciel) ; le reste de la pile en gris neutre (fret d'autres affréteurs) ;
   - capacités par vaisseau (conteneurs 1 à 5 selon la taille ; passagers et VIP ; eau en réservoirs ; lots) ;
   - missions locales (tous vaisseaux) et entre systèmes (long-courriers : 24 étoiles les plus proches,
     carburant suffisant — mêmes règles que la carte) ;
   - prime et score de risque (§5 de la spec) ; livraison payée à la prime de la mission.
   À venir : gabares du port (M2), escorte SMP et incidents (M3), négociation (M4), Gemini Nano (M5).
   Le démarrage rapide des tests garde l'itinéraire, sauf option { missions: true }.
   ========================================================================= */
const MISSIONS = (function(){
const V3 = THREE.Vector3;
const NATURES = { denrees: 0xf0a030, equipements: 0x3f9a52, armes: 0xc8342c, minerais: 0x4a4d52, eau: 0x7cc8f0 };
const NEUTRAL = 0x8c9199;
const UNIT = { denrees: 220, eau: 180, equipements: 300, minerais: 260, armes: 600 };
const NAT_PTS = { denrees: 0, eau: 0, equipements: 1, minerais: 1, armes: 3 };
const CAP = { e18: [1, 3], p10: [1, 2], p44: [2, 4], e140: [3, 5] };
const TXT = {
  fr: { title: 'MISSIONS DISPONIBLES', sub: 'Couleur des conteneurs = nature du fret', accept: 'Accepter', negotiate: 'Négocier', negoSoon: 'Négociation : lot M4',
        denrees: 'denrées', equipements: 'équipements', armes: 'armes', minerais: 'minerais', mineraisRares: 'minerais rares', eau: 'eau',
        pax: 'passagers', vip: 'dont VIP', tanks: 'réservoirs d\u2019eau', lot: 'lot', local: 'local', jump: 'saut',
        risk: ['RISQUE FAIBLE', 'RISQUE MOYEN', 'RISQUE ÉLEVÉ', 'RISQUE CRITIQUE'], mission: 'MISSION', empty: 'Aucune mission compatible ici.' },
  en: { title: 'AVAILABLE MISSIONS', sub: 'Container colour = cargo type', accept: 'Accept', negotiate: 'Negotiate', negoSoon: 'Negotiation: lot M4',
        denrees: 'foodstuffs', equipements: 'equipment', armes: 'weapons', minerais: 'ore', mineraisRares: 'rare ore', eau: 'water',
        pax: 'passengers', vip: 'incl. VIP', tanks: 'water tanks', lot: 'lot', local: 'local', jump: 'jump',
        risk: ['LOW RISK', 'MEDIUM RISK', 'HIGH RISK', 'CRITICAL RISK'], mission: 'MISSION', empty: 'No suitable mission here.' },
  de: { title: 'VERFÜGBARE AUFTRÄGE', sub: 'Containerfarbe = Frachtart', accept: 'Annehmen', negotiate: 'Verhandeln', negoSoon: 'Verhandlung: Los M4',
        denrees: 'Lebensmittel', equipements: 'Ausrüstung', armes: 'Waffen', minerais: 'Erze', mineraisRares: 'seltene Erze', eau: 'Wasser',
        pax: 'Passagiere', vip: 'davon VIP', tanks: 'Wassertanks', lot: 'Los', local: 'lokal', jump: 'Sprung',
        risk: ['GERINGES RISIKO', 'MITTLERES RISIKO', 'HOHES RISIKO', 'KRITISCHES RISIKO'], mission: 'AUFTRAG', empty: 'Hier kein passender Auftrag.' },
  es: { title: 'MISIONES DISPONIBLES', sub: 'Color del contenedor = tipo de carga', accept: 'Aceptar', negotiate: 'Negociar', negoSoon: 'Negociación: lote M4',
        denrees: 'víveres', equipements: 'equipos', armes: 'armas', minerais: 'minerales', mineraisRares: 'minerales raros', eau: 'agua',
        pax: 'pasajeros', vip: 'con VIP', tanks: 'depósitos de agua', lot: 'lote', local: 'local', jump: 'salto',
        risk: ['RIESGO BAJO', 'RIESGO MEDIO', 'RIESGO ALTO', 'RIESGO CRÍTICO'], mission: 'MISIÓN', empty: 'Ninguna misión adecuada aquí.' }
};
const tx = () => TXT[typeof LANG !== 'undefined' && TXT[LANG] ? LANG : 'fr'];
const S = { enabled: false, active: null, offers: [], el: null, hud: null, pendingGo: false, done: [], shownKey: null, delivering: false, serial: 0 };
const hex = c => '#' + c.toString(16).padStart(6, '0');

/* ---------- vaisseau : ce qu'il transporte ---------- */
function model(){ return SHIPGEN.MODELS.find(m => m.id === SHIP_ID) || {}; }
function cargoSpec(){
  const m = model();
  if(CAP[SHIP_ID]) return { kind: 'containers', range: CAP[SHIP_ID], natures: Object.keys(NATURES) };
  if(m.group === 'Passagers') return { kind: 'passengers', range: [10, 120] };
  if(m.group === 'Fret en vrac') return { kind: 'tanks', range: [3, 15], natures: ['eau'] };
  if(m.group === 'Indépendants') return { kind: 'lot', range: [1, 1], natures: ['armes', 'equipements'] };
  return { kind: 'lot', range: [1, 1], natures: ['equipements'] };
}
const canTravel = () => !!(typeof hasQuantumJump !== 'undefined' && hasQuantumJump) || !!(typeof SHIP_WARP !== 'undefined' && SHIP_WARP);

/* ---------- destinations ---------- */
function localBodies(){
  const leg = REAL.leg; if(!leg) return [];
  const here = REAL.mission && REAL.mission.target, out = [];
  leg.planets.forEach(p => { if(p !== here) out.push({ body: p, name: p.properName || p.name, kindKey: 'planet' }); });
  leg.planets.forEach(p => (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(!m) return;
    out.push({ body: { position: m.getWorldPosition(new V3()), radius: m.scale.x, kind: { gas: false }, isMoon: true, name: pv.userData.moonName }, name: pv.userData.moonName, kindKey: 'moon' }); }));
  (leg.stations || []).forEach(st => { if(st !== here) out.push({ body: st, name: st.name, kindKey: 'port' }); });
  return out.filter(d => d.name);
}
function reachableStars(){
  const p = REAL.galPos, cx = Math.round(p.x/STAR_CELL), cy = Math.round(p.y/STAR_CELL), cz = Math.round(p.z/STAR_CELL), list = [];
  for(let dx = -STAR_MAP_RADIUS; dx <= STAR_MAP_RADIUS; dx++) for(let dy = -STAR_MAP_RADIUS; dy <= STAR_MAP_RADIUS; dy++) for(let dz = -STAR_MAP_RADIUS; dz <= STAR_MAP_RADIUS; dz++){
    const d = starDataForCell(cx + dx, cy + dy, cz + dz); if(d && d.cell !== REAL.leg.cell) list.push([d.position.distanceTo(p), d]); }
  list.sort((a, b) => a[0] - b[0]);
  return list.slice(0, STAR_MAP_MAX_CANDIDATES).map(e => e[1]).filter(sd => typeof quantumJumpFuelCost !== 'function' || !hasQuantumJump || fuel >= quantumJumpFuelCost(sd.position.distanceTo(REAL.leg.gal)));
}
/* ---------- génération des offres ---------- */
function zoneRisk(cell){ const r = rngFor(SEED + ':zone:' + cell); return Math.floor(r()*4); }
function riskLevel(o){
  const pts = (o.nature ? NAT_PTS[o.nature] + (o.rare ? 2 : 0) : 0) + (o.reward > 3000 ? 2 : o.reward > 1200 ? 1 : 0) + (o.vip ? 2 : 0) + o.zone + (o.inter ? 1 : 0);
  return pts <= 2 ? 0 : pts <= 4 ? 1 : pts <= 6 ? 2 : 3;
}
function generate(){
  const leg = REAL.leg, spec = cargoSpec(), r = rngFor(SEED + ':missions:' + leg.cell + ':' + (REAL.hops || 0) + ':' + S.serial++);
  const pick = a => a[Math.floor(r()*a.length)];
  const dests = localBodies().map(d => Object.assign({ inter: false, dist: d.body.position.distanceTo(shipRig.position) }, d));
  if(canTravel()) reachableStars().slice(0, 6).forEach(sd => dests.push({ inter: true, sd: sd, name: sd.name, dist: sd.position.distanceTo(REAL.leg.gal), kindKey: 'star' }));
  const shuffled = dests.map(d => [r(), d]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
  const inter = shuffled.filter(d => d.inter).slice(0, 2), local = shuffled.filter(d => !d.inter).slice(0, 5 - inter.length);
  return local.concat(inter).map(d => {
    const q = spec.range[0] + Math.floor(r()*(spec.range[1] - spec.range[0] + 1)), o = { dest: d, inter: d.inter, qty: q, kind: spec.kind, zone: zoneRisk(d.inter ? d.sd.cell : leg.cell) };
    const au = d.inter ? 0 : d.dist/1.496e11, pc = d.inter ? d.dist : 0;
    const distF = d.inter ? 2.5 + .12*pc : 1 + Math.min(au, 12)/4;
    if(spec.kind === 'passengers'){ o.vip = r() < .25; o.reward = Math.round(q*(30 + 20*r())*(o.vip ? 3 : 1)*distF/10)*10; }
    else { o.nature = pick(spec.natures); o.rare = o.nature === 'minerais' && r() < .2;
      const unit = spec.kind === 'tanks' ? 150 : spec.kind === 'lot' ? (o.nature === 'armes' ? 1600 : 900) : UNIT[o.nature]*(o.rare ? 2 : 1);
      o.reward = Math.round(q*unit*distF*(.9 + .2*r())/10)*10; }
    o.risk = riskLevel(o);
    if(d.inter) o.g = { name: d.sd.name, designation: d.sd.star.designation, starPosition: d.sd.position.clone(), cell: d.sd.cell, star: d.sd.star };
    return o;
  });
}
/* ---------- pile du vaisseau : couleurs ---------- */
const matCache = new Map();
function tinted(mat, color){ const k = mat.uuid + ':' + color; if(!matCache.has(k)){ const m = mat.clone(); m.color = new THREE.Color(color); matCache.set(k, m); } return matCache.get(k); }
function stackContainers(){ const out = []; if(!SHIP_HULL) return out; SHIP_HULL.updateMatrixWorld(true);
  SHIP_HULL.traverse(o => { if(o.userData && o.userData.cargo) out.push(o); }); return out; }
function paint(o, color){ o.traverse(m => { if(!m.isMesh) return; if(!m.userData.baseMat) m.userData.baseMat = m.material; m.material = tinted(m.userData.baseMat, color); }); }
function paintStack(mission){
  const all = stackContainers(); if(!all.length) return 0;
  all.forEach(c => { c.userData.mission = false; paint(c, NEUTRAL); });
  if(!mission || mission.kind !== 'containers') return 0;
  const loc = all.map(c => ({ c, x: Math.abs(shipRig.worldToLocal(c.getWorldPosition(new V3())).x) })), maxX = Math.max(...loc.map(e => e.x));
  const outer = loc.filter(e => e.x >= maxX - .5*(e.c.userData.cdims ? e.c.userData.cdims[0] : 2)).map(e => e.c);
  outer.slice(0, mission.qty).forEach(c => { c.userData.mission = true; c.visible = true; paint(c, NATURES[mission.nature]); });
  return Math.min(mission.qty, outer.length);
}
/* ---------- interface ---------- */
function cargoLabel(o){
  const T = tx();
  if(o.kind === 'passengers') return o.qty + ' ' + T.pax + (o.vip ? ' · ' + T.vip : '');
  if(o.kind === 'tanks') return o.qty + ' ' + T.tanks;
  const n = o.rare ? T.mineraisRares : T[o.nature];
  return o.kind === 'lot' ? '1 ' + T.lot + ' · ' + n : o.qty + ' × ' + n;
}
function swatches(o){
  if(!o.nature) return '';
  return Array.from({ length: o.kind === 'containers' ? o.qty : 1 }, () => "<span style='display:inline-block;width:12px;height:12px;margin-right:3px;background:" + hex(o.rare ? 0x26282b : NATURES[o.nature]) + ";border:1px solid rgba(255,255,255,.25);vertical-align:middle'></span>").join('');
}
function distLabel(o){ const T = tx(); return o.inter ? (o.dest.dist.toFixed(1) + ' pc · ' + T.jump) : (REAL.fmt.dist(o.dest.dist) + ' · ' + T.local); }
function ensureDom(){
  if(S.el) return;
  const el = document.createElement('div'); el.id = 'missionBoardOverlay'; el.className = 'mono';
  el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:6;background:rgba(2,5,12,.45)';
  el.innerHTML = "<div class='board-panel' style='max-width:760px;width:92vw'><div class='board-title' id='missionTitle'></div><div class='board-sub' id='missionSub'></div><div class='board-list' id='missionList'></div></div>";
  document.body.appendChild(el); S.el = el;
  el.querySelector('#missionList').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if(b && b.dataset.act === 'accept') accept(+b.dataset.i); });
  const h = document.createElement('div'); h.id = 'missionHud'; h.className = 'mono';
  h.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:10px;z-index:6;display:none;font-size:11px;letter-spacing:.06em;padding:6px 12px;border:1px solid #25375c;background:rgba(15,26,48,.88);color:#e8edf5;pointer-events:none';
  document.body.appendChild(h); S.hud = h;
}
function riskTag(l){ const c = ['#5eead4', '#ffb454', '#ff6b57', '#ff2d55'][l]; return "<span style='font-size:9.5px;padding:2px 6px;border:1px solid " + c + ";color:" + c + "'>" + tx().risk[l] + '</span>'; }
function openBoard(){
  ensureDom(); const T = tx(), leg = REAL.leg;
  S.offers = generate();
  const here = (REAL.mission && REAL.mission.target && (REAL.mission.target.properName || REAL.mission.target.name)) || leg.name;
  S.el.querySelector('#missionTitle').textContent = T.title + ' · ' + here;
  S.el.querySelector('#missionSub').textContent = T.sub;
  S.el.querySelector('#missionList').innerHTML = S.offers.length ? S.offers.map((o, i) =>
    "<div class='board-row' data-mission='" + i + "'><div class='board-row-info'><div class='board-row-name'>" + o.dest.name + (o.inter ? ' (' + o.dest.name + ')' : '') + "</div>" +
    "<div class='board-row-meta'>" + swatches(o) + ' ' + cargoLabel(o) + ' · ' + distLabel(o) + '</div></div>' +
    "<div style='text-align:right;min-width:190px'><div style='color:#ffb454;font-size:12px'>" + o.reward.toLocaleString('fr-FR') + " CR</div><div style='margin:5px 0'>" + riskTag(o.risk) + '</div>' +
    "<button class='board-row-btn' data-act='accept' data-i='" + i + "'>" + T.accept + "</button> <button class='board-row-btn' disabled title='" + T.negoSoon + "' style='opacity:.45'>" + T.negotiate + '</button></div></div>').join('')
    : "<div class='board-empty'>" + T.empty + '</div>';
  S.el.style.display = 'flex'; S.shownKey = keyNow();
}
function closeBoard(){ if(S.el) S.el.style.display = 'none'; }
const boardOpen = () => !!(S.el && S.el.style.display === 'flex');
function keyNow(){ return (REAL.leg ? REAL.leg.cell : '') + ':' + (REAL.hops || 0) + ':' + S.done.length; }
function hud(){
  ensureDom(); const o = S.active; if(!o){ S.hud.style.display = 'none'; return; }
  S.hud.innerHTML = "<span style='color:#ffb454'>" + tx().mission + '</span> · ' + swatches(o) + ' ' + cargoLabel(o) + ' → ' + o.dest.name + ' · ' + o.reward.toLocaleString('fr-FR') + ' CR · ' + riskTag(o.risk);
  S.hud.style.display = 'block';
}
/* ---------- déroulé ---------- */
function accept(i){
  const o = S.offers[i]; if(!o) return;
  S.active = o; o.id = ++S.serial; closeBoard(); paintStack(o); hud();
  if(flightPhase === 'ARRIVAL_PAUSE'){ S.pendingGo = true; if(!S.delivering) orbitState.missionGo = true; }   /* rien à livrer : l'escale s'achève */
  else go();
}
let departFn = null;
function go(){
  const o = S.active; S.pendingGo = false; if(!o) return;
  if(o.inter){ REAL.nextOverride = o.g; if(departFn) departFn(REAL.mission); }
  else REAL.plan(REAL.leg, o.dest.body, true);
}
/* R.afterEscale, en mode missions : tableau (sans mission) ou départ vers la destination (mission acceptée) */
function afterEscale(M, depart){
  departFn = depart;
  if(S.active){ if(S.pendingGo) go(); return; }
  if(!boardOpen()) openBoard();
}
function atDestination(){
  const o = S.active; if(!o || !REAL.mission) return false;
  if(o.inter) return REAL.leg && REAL.leg.cell === o.g.cell;
  return REAL.mission.target === o.dest.body || (o.dest.body.isMoon && REAL.mission.target && REAL.mission.target.name === o.dest.body.name);
}
/* escale (module 33) : cargaison = celle de la mission à destination ; aucune livraison sinon */
function setupEscale(os){
  if(!S.enabled) return;
  if(S.active && atDestination()){
    S.delivering = true;
    const n = Math.max(1, os.spawnFractions.length), q = S.active.kind === 'containers' ? S.active.qty : 1;
    os.cargoSplit = new Array(n).fill(0); for(let c = 0; c < q; c++) os.cargoSplit[c % n]++;
    os.unitPrice = S.active.reward/q; os.creditsPaid = false;
  } else { S.delivering = false; os.spawnFractions = []; os.spawned = []; os.cargoSplit = []; os.creditsPaid = true; }
  os.missionGo = false;
}
function complete(){ S.done.push(S.active); S.active = null; S.delivering = false; paintStack(null); hud(); }
function update(){
  if(!S.enabled || !REAL.started) return;
  if(S.delivering && S.active && orbitState.creditsPaid) complete();
  /* tableau dès la mise en orbite (sans mission), pendant l'appel du contrôle */
  if(!S.active && REAL.phase === 'ORBIT' && flightPhase === 'ARRIVAL_PAUSE' && !boardOpen() && S.shownKey !== keyNow()) openBoard();
}
/* ---------- démarrage : en orbite près de la planète de départ ---------- */
function itineraryUi(hide){
  if(!document.getElementById('missionModeCss')){ const st = document.createElement('style'); st.id = 'missionModeCss';
    st.textContent = 'body.missions-mode #itineraryPanel, body.missions-mode #lagrangePanel, body.missions-mode .route-panel, body.missions-mode #routePanel{ display:none !important; }';
    document.head.appendChild(st); }
  document.body.classList.toggle('missions-mode', !!hide);
  const fp = document.getElementById('lblFlightPlan'); const panel = fp && fp.closest('.panel'); if(panel) panel.style.display = hide ? 'none' : '';
}
function start(){
  itineraryUi(true);
  S.enabled = true; S.active = null; S.done = []; ensureDom(); paintStack(null); hud();
  const M = REAL.mission; if(!M || !M.tr) return;
  M.t = M.tr.prof.D; REAL.phase = 'APPROACH'; REAL.tau = 1; M.s = M.Lc;     /* transfert et approche sautés : mise en orbite immédiate */
}
return { start, update, afterEscale, setupEscale, enabled: () => S.enabled, setEnabled: v => { S.enabled = !!v; if(!v) itineraryUi(false); }, state: S, NATURES, cargoSpec, paintStack, openBoard, accept, generate };
})();
