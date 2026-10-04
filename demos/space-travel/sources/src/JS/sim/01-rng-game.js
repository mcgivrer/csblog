/* =========================================================================
   CAMPAGNE 2. ALÉA DE LA SIMULATION — RNG.game(tag) : suites déterministes dérivées de la graine de la partie
   Même graine + même tag = même suite (jamais Math.random dans la logique de campagne).
   ========================================================================= */
/* @provides RNG @requires GAME @requires-engine xmur3, mulberry32, SEED */
const RNG = (function(){
  /* Graine de la campagne en cours, sinon celle de l'univers (SEED) ; un tag par usage (« marche », « mission:12 »…) */
  function game(tag){
    const seed = GAME.state ? GAME.state.seed : SEED;
    return mulberry32(xmur3(seed + ':game:' + tag)());
  }
  return { game: game };
})();
