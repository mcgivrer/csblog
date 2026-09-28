/* =========================================================================
   CARBURANT (§22) — jauge, consommation liée au régime moteur,
   ravitaillement en escale.
   ========================================================================= */
/* Réservoir de départ dimensionné contre les constantes RÉELLES du
   générateur de routes (§22.1) : un saut mesure 700-1500 u (HOP_MIN/MAX,
   findNextWaypoint), ~1100 u en moyenne ; une route compte 3-12 étapes
   (legCount), ~7,5 en moyenne — soit ~8000 u par itinéraire complet en
   croisière économique. 24 000 u ≈ 3 itinéraires à ce régime. */
const FUEL_CAPACITY = 24000;
let fuel = FUEL_CAPACITY;
/* sous ce ratio vitesse/croisière, aucun surcoût : une amélioration
   Propulseurs (ci-dessus) ne change donc PAS le coût en carburant d'un
   trajet, seulement sa durée — cf. §22.2. Au-delà (boost), l'exposant 1,5
   fait grimper vite le coût : un trajet intégralement boosté coûterait
   ≈ 5,46× la référence (BOOST_MULT^1.5), plus qu'un réservoir plein —
   délibéré, le boost soutenu doit rester un appoint, pas un régime de
   croisière. */
const FUEL_CONSUMPTION_EXPONENT = 1.5;
/* à sec, le vaisseau n'est pas totalement immobilisé (ce qui bloquerait
   la partie sans espoir de rejoindre un port) : le boost devient
   indisponible et la croisière tombe à ce ratio — de quoi se traîner
   jusqu'à l'escale la plus proche, pas de quoi continuer normalement.
   Ce comportement à vide n'était pas détaillé dans la proposition
   d'origine (§22) ; choisi ici pour rester jouable plutôt que de bloquer
   la partie. */
const FUEL_EMPTY_SPEED_SCALE = 0.2;
/* tarif du ravitaillement (§22.3) : facturé uniquement sur le volume
   manquant, jamais un forfait fixe. */
const FUEL_PRICE_PER_UNIT = 0.20;
/* seuils d'alerte HUD (§22.4), proposition de départ à ajuster en playtest */
const FUEL_WARN_RATIO = 0.25, FUEL_CRIT_RATIO = 0.10;
function fuelRefuelCost(){
  return Math.ceil((FUEL_CAPACITY - fuel) * FUEL_PRICE_PER_UNIT);
}
