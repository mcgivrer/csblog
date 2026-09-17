# Todo

## 2026/09/16

### Bugs

- Dans la génération, les planètes sont trop proches les unes des autres: espacer les planètes et leurs étoiles de façon proportionnelle. Attention, veiller à ce que la vitesse de deplacement dans le jeu soit adaptée en conséquence.
- Certaines planètes dans le plan de vol sont parfois invisibles lors du rendu, il faut corriger cela.
- le panel des Services portuaires se superpose à celui du canal radio, inverse les. Ajoute une icone "Service Portuaire" qui sera activable uniquement si proche d'une planete proposant ces services oubien si la livraison est en cours.

### Améliorations

- Ajouter une icône de fermeture sur chaque panneau (croix), à coordonner avec la barre d'icônes.
- Pour chaque icône d'activation des panels, assigner une touche de fonction de <kbd>F1</kbd> à <kbd>F8</kbd> (refaire l'affectation) (revoir l'aide)
- L'icône de Caméra doit proposer une symbolique spéciale pour chaque type de vue.
- L'aide (touche H) doit s'afficher en overlay au centre, avec un design comme les autres panels.
- Lors du démarrage du jeu, après l'écran de titre, au moment où le vaisseau cargo apparaît, il faut ajouter un message radio de bienvenue au joueur (le capitaine du cargo).
- Dans le panneau radio, ajouter des avatars de chaque interlocuteur.
- Réduire la largeur du panel  "Plan de vol",
- Ajouter l'affichage de l'objet concerné dans le panneau "Objet le plus proche" (rendu de la lune / planète / étoile, etc...)
- Ajouter un label + flèche comme pour les planètes / étoiles sur les vaisseaux (cargo+navette), le cercle de cible doit entourer l'objet.
- Une  navette quittant le dock doit opérer une translation vers le bas (repère initial = cargo) en partant du centre du dock, puis s'éloigner progressivement du cargo, puis amorcer sa descente vers le port spatial cible.
- Ajouter une trainée au propulseur principal des navettes pour mieux les suivre.
- Prévoir l'affichage de la map de l'univers en overlay, activable  avec la touche <kbd>M</kbd>, faire des propositions visuelles (2D, 3D, navigable ou pas, etc.)

##  Démarche

Aide-moi à raffiner ces besoins et correctifs :

1. Fait des propositions,
2. Mets à jour la spécification Markdown: ajouter des illustrations (images au format SVG ou captures réelles du navigateur, suivant le besoin)  et des diagrammes si nécessaire,
3. Procède à l'implémentation.
