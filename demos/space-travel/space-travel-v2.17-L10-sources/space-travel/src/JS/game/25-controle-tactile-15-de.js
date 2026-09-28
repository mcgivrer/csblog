/* =========================================================================
   CONTRÔLE TACTILE — §15 de la spec v2.1. Détection par capacité de
   pointage plutôt que par taille d'écran (un ordinateur portable dans une
   petite fenêtre n'est pas une tablette) ; recalculée à chaque changement
   d'orientation puisqu'un appareil peut basculer en cours de partie.
   Les boutons pilotent les MÊMES variables (`keys[...]`) que le clavier :
   aucune logique de vol nouvelle, updateFlight() ne voit pas la différence. */