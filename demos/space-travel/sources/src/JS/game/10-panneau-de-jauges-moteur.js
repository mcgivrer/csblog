/* =========================================================================
   5bis. PANNEAU DE JAUGES MOTEUR — construit dynamiquement à partir des
   mêmes tableaux que ceux qui pilotent les sprites (aucune donnée dupliquée
   à la main : 4 réacteurs, 16 tuyères RCS, toujours en phase avec la coque).
   ========================================================================= */
const RCS_AXIS_LABELS = {
  yaw:   {P:'LACET +',    N:'LACET −'},
  pitch: {P:'TANGAGE +',  N:'TANGAGE −'},
  roll:  {P:'ROULIS +',   N:'ROULIS −'}
};
window.__gaugeEls = {main:[], rcs:[]};

function buildEnginePanel(){
  window.__gaugeEls = {main:[], rcs:[]};
  const row = document.getElementById('enginesRow');
  if(!row) return;
  row.innerHTML = '';

  /* réacteurs principaux : larges */
  (window.__engineGlows||[]).forEach(function(g, i){
    const el = document.createElement('div');
    el.className = 'gauge main';
    el.innerHTML =
      '<div class="gauge-pct" id="mainPct'+i+'">0%</div>' +
      '<div class="gauge-track"><div class="gauge-fill" id="mainFill'+i+'"></div></div>' +
      '<div class="gauge-label">M'+(i+1)+'</div>';
    row.appendChild(el);
    window.__gaugeEls.main.push({
      fill: null, pct: null   /* résolus juste après l'insertion DOM */
    });
  });
  window.__gaugeEls.main.forEach(function(g,i){
    g.fill = document.getElementById('mainFill'+i);
    g.pct  = document.getElementById('mainPct'+i);
  });

  const sep = document.createElement('div');
  sep.className = 'gauge-sep';
  row.appendChild(sep);

  /* tuyères d'attitude : fines, numérotées dans l'ordre de la coque
     dans l'ordre de pose sur la coque du modèle (v2.13+ : leur nombre et leur
     axe dépendent du vaisseau) — la couleur garde la lecture par axe, le
     numéro permet de désigner une tuyère précise */
  (window.__rcs||[]).forEach(function(t, i){
    const sign = t.sign > 0 ? 'P' : 'N';
    const fullLabel = RCS_AXIS_LABELS[t.axis][sign];
    const el = document.createElement('div');
    el.className = 'gauge rcs axis-'+t.axis;
    el.title = 'Propulseur '+(i+1)+' — '+fullLabel;
    el.innerHTML =
      '<div class="gauge-track"><div class="gauge-fill" id="rcsFill'+i+'"></div></div>' +
      '<div class="gauge-label">'+(i+1)+'</div>';
    row.appendChild(el);
  });
  window.__gaugeEls.rcs = (window.__rcs||[]).map(function(t,i){
    return {fill: document.getElementById('rcsFill'+i), thruster: t};
  });

  /* carburant (§22) : même rangée, séparée par le même trait que les RCS
     des réacteurs principaux — pas un panneau à part (cf. commentaire CSS
     ci-dessus). */
  const fuelSep = document.createElement('div');
  fuelSep.className = 'gauge-sep';
  row.appendChild(fuelSep);
  const fuelEl = document.createElement('div');
  fuelEl.className = 'gauge fuel';
  fuelEl.id = 'fuelGauge';
  fuelEl.innerHTML =
    '<div class="gauge-pct" id="fuelPct">100%</div>' +
    '<div class="gauge-track"><div class="gauge-fill" id="fuelFill"></div></div>' +
    '<div class="gauge-label" id="lblFuel">CARBURANT</div>';
  row.appendChild(fuelEl);
}
buildEnginePanel();
