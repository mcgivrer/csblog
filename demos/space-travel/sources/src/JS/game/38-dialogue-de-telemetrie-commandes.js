/* =========================================================================
   DIALOGUE DE TÉLÉMÉTRIE — commandes d'allumage/puissance envoyées aux
   moteurs. Panneau fixe du HUD (rangée basse), à côté de la propulsion —
   il était auparavant projeté en 3D juste à côté du vaisseau ; l'ancrage
   fixe est plus lisible et ne bouge plus avec la caméra.
   ========================================================================= */
let lastTmUpdate = 0;
function updateTelemetryPanel(mainPowers, boosting){
  /* le texte n'a pas besoin d'être réécrit à 60 Hz : ~6 fois/s suffit à
     donner l'impression d'un flux temps réel sans agiter le lecteur */
  const now = performance.now();
  if(now - lastTmUpdate < 160) return;
  lastTmUpdate = now;

  const body = document.getElementById('telemetryBody');
  if(!body) return;
  const avgMain = mainPowers.reduce(function(a,b){return a+b;},0)/Math.max(mainPowers.length,1);
  let html = '<div class="tm-line'+(boosting?' tm-amber':'')+'">' +
    '<span>'+t('reactors14').replace('{r}', mainPowers.length > 1 ? '1-' + mainPowers.length : '1')+'</span><span>'+(avgMain>0.02?Math.round(avgMain*100)+'%':t('veille').toUpperCase())+'</span></div>';

  const groups = [
    ['yaw','P','rcs_yawP'], ['yaw','N','rcs_yawN'],
    ['pitch','P','rcs_pitchP'], ['pitch','N','rcs_pitchN'],
    ['roll','P','rcs_rollP'], ['roll','N','rcs_rollN']
  ];
  let anyRcs = false;
  groups.forEach(function(g){
    const lvl = rcsLevel[g[0]+g[1]] || 0;
    if(lvl > 0.02){
      anyRcs = true;
      html += '<div class="tm-line"><span>'+t('rcsLabel')+' '+t(g[2])+'</span><span>'+Math.round(lvl*100)+'%</span></div>';
    }
  });
  if(!anyRcs) html += '<div class="tm-line tm-off"><span>'+t('rcsLabel')+'</span><span>'+t('veille')+'</span></div>';

  body.innerHTML = html;
}
