/* ajout du jeu (lot N2) — porte-conteneurs : baie ventrale de la navette-cargo (17,5 × 5,6 × 6,8 m) au point d'amarrage ;
   modL fixé pour une ouverture de ~19,6 m (hx = 0,36 modL), w pour une demi-largeur ≥ 4 m, h pour 10 m de profondeur.
   Étend la table BELLY du module commun shared/shipglass.js (chargé juste avant). */
Object.assign(__SHIPGLASS.BELLY, {
  e18:  { w: 16.0, h: 16.0, modL: 27.2, ch: .15 },
  e140: { w: 18.0, h: 18.0, modL: 27.8, ch: .15 },
  p10:  { w: 13.9, h: 15.9, modL: 27.2, ch: .15 },
  p44:  { w: 13.9, h: 15.8, modL: 27.2, ch: .15 }
});
