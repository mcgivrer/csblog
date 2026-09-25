# Todo

##  Démarche

Aide-moi à raffiner ces besoins et correctifs :

1. Fait des propositions,
2. Mets à jour la spécification Markdown: ajouter des illustrations (images au format SVG ou captures réelles du navigateur, suivant le besoin)  et des diagrammes si nécessaire,
3. Procède à l'implémentation.

## 2026/09/16 - v2.4

### Bugs

- Dans la génération, les planètes sont trop proches les unes des autres: espacer les planètes et leurs étoiles de façon proportionnelle. Attention, veiller à ce que la vitesse de deplacement dans le jeu soit adaptée en conséquence.
- Certaines planètes dans le plan de vol sont parfois invisibles lors du rendu, il faut corriger cela.
- le panel des Services portuaires se superpose à celui du canal radio, inverse les. Ajoute une icone "Service Portuaire" qui sera activable uniquement si proche d'une planete proposant ces services oubien si la livraison est en cours.

### Améliorations pour la v2.4

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

## 2026/09/18 - v2.5

### Améliorations pour la v2.5

- Pour la touche <kbd>I</kbd> déjà site dans la doc pour la réparation, la remplacer par la touche <kbd>J</kbd>.
  
- Modifier la spec pour intégrer la gestion de la **consommation de carburant**. Ce carburant pourra être acheter dans les port spatiaux lors des escales. Attention a bien estimer les quantités de carburant initiale pour ne pas laisser le joueur en panne dès le première étape. Il doit pouvoir faire de 1 a 3 itinéraires, en fonction de sa consommation (regime moteur).

- Cela vient avec un mécanisme d'**évolution des systèmes de propulsion** principale qui fournira le **saut quantique** (réfléchir à un effet visuel) qui permettra au vaisseau de sauter directement a proximité d'une étoile ou d'une planète, en la choisissant sur la carte stellaire.
- Cette **carte** est à mettre en place sur la touche <kbd>M</kbd>.
- Le **saut quantique** pourra d'acquérir lors des étapes dans ports spatiaux.

- Il faut maintenant également définir un **nouveau type de port**, les **ports orbitaux** gravitant autour d'une planète. Les ports ne seront pas toujours sur les planètes, mais dans l'espace.  Créer un nombre restreint de modèle 3d de ports orbitaux lors de la génération initiale et en créer des instances dans certains systèmes planétaire.

- Pour la prochaine génération de la spec (2.6) : il faudra la faire par défaut **en anglais**, et refaire toutes les captures d'écran (laptop, tablette et smartphone)  pour que le texte dans le jeu soit en anglais.

- **Revoir la position des différents panels en mode smartphone** pour qu'ils soient tous affichés au même endroit, mais ils sont alors exclusifs.

### Retour de la documentation (français et anglais)

- Dans le chapitre 9, peux-tu préciser la mécanique de génération avec quelques paragraphes et quelques formules de mathématiques expliquant le principe du générateur à graine.
- Pour le chapitre 22, proposer les maquettes en wireframing pour l'affichage de la consommation de carburant
- Pour le chapitre 23, proposer un maquette en wireframing de l'affichage de la carte en 3D, les décisions de détails visuels seront prises à l'implémentation.

## 2026/09/20

### Bugs

1. Le texte affiché lors du démarrage du jeu doit être affioché en anglais par défaut: procéder à sa traduction dans les différentes langues du jeu, ainsi lors du redémarrage d'une partie on connait la langue précédemment selectionnée, on peut afficher dan sla bonne langue.

   1. vérifier que le volume solnore de la voix "text to speach" est bien contrôlée

### Améliorations

1. Sur la base du document d'étude du systèlme de génération, il faut revoir la notion d'échelle entre les différentes distances entre étoiles, planetes et satellites. En effet, les planetes d'une étoile semblent trop grosses et peu distantes de leur étoile.  la taille du vaisseau est aussi a revoir, il est beacoup trop gros par rapport aux planetes

2. il y a toujours ce bug de tressautement de la camera ou des objets cible de la camera: en gros plan les cargo et navette semble sacadées ou tressauter. Il faut revoir l'algorithme de positionnement de la camera et celui de calcul de la position des vaisseaux.

3. Lorsque le carburant est vide, les moteurs principaux s'arrêtent, le cargo se met alors à dériver en continuant sa route, mais en décélérant lentement. Une alerte est affichée dans un nouveau dialogue sur fond orange (alerte/warning) et un message explicite indique la raison de la panne. 2 options sont alors proposée, arrếter la partie (1), oubien demander de l'aide (2). Si le joueur choisit l'option 1, il est renvoyé sur l'écran de titre, après confirmation. Si il choixi l'option 2 et si il a assez de crédits, un vaisseau de ravittaillement (type vaisseau citerne) arrive après une certaine attente (entre 5 et 20 s) et s'arime au cargo pour le transfert de carburant.  la jauge de carburant dremonte et une fois à 100% les crédits sont débités et le vaisseau citerne se désarime et part.  Si le joueur interompt la manoeuvre (ESAPCE, propulsion, etc.) le vaisseau citerne est automatiquement désarimé (sysème de sécurité). l'intégralité de la somme due est prélevé malgré un plein non complet !  En cas de désarrimage demandé, une confirmation est demandée pour valider l'opération.
