# trace des demandes d'améliorations

## Amélioration

### v1.0

#### Bugs

- Lors de l'approche de la destination, aucun petit vaisseau ne vient, y-a-t-il un bug sur l'affichage de cette séquence ?
- Je ne vois jamais apparaître le panneau RADIO, corrige ce bug.

- Attention à ce que la trajectoire calculée du vaisseau évite les planètes ! Le vaisseau passe à travers certaines planètes durant son vol.
- La séquence d'approche ne se déclenche toujours pas ! Vérifie et teste.

- Lors des échanges entre vaisseaux, attention à bien attendre la fin de la dictée par la synthèse vocale des messages.
- La phase d'approche doit être déclenchée à CHAQUE étape de l'itinéraire.
- Les pointillés des rectangles de l'itinéraire doivent être plus petits (plus denses)

#### Améliorations

##### Step 0

- La combinaison CTRL+souris permet de faire tourner la caméra autour du vaisseau
- Ajouter des bruitages lors d'echange RADIO. y-a-t-il un moyen d'avoir de la synthèse vocale avec des voix différentes via une API intenet gratuiee ?

##### Step 1

- Sur l'affichage des noms des étoiles, ajouter un cercle autour de l'objet nommé avec une flèche entre le nom et l'objet. (respecter la charge graphique en place)
- Afficher les noms des planètes et des lunes. Si la planète a un ou plusieurs ports, lors de l'approche, on affiche les noms de ceux-ci.
- Ajouter des étoiles en fond à titre décoratif (mais en respectant les lois physiques des couleurs, distance, etc...) afin de rendre l'espace moins vide
- Les rectangles de trajectoire doivent être tracés en vert, avec 2 angles orange, afin de respecter la charte graphique. Les traits verts seront en pointillés.
- Éloigner les planètes ! Elles sont beaucoup trop proches les unes des autres, c'est irréaliste : vérifier dans les standards d'astrophysique (mais corrigé car cela reste un jeu)
- Un simple appui court sur la touche CTRL ramène la caméra derrière le vaisseau, à sa position d'origine

##### Step 2

- Rendre aléatoire le nombre d'étapes du trajet (3 à 12)
- La phase d'approche doit être ralentie par rapport au reste du trajet, on doit avoir le temps de voir les déchargements de conteneurs, les plans et les travelings caméra doivent être plus lents.
- La variation des voix doit combiner aléatoirement masculin et féminin dans les interlocuteurs,
- La touche TAB sera un switch permettant de faire  apparaître / disparaître  le module RADIO de comm,
- Mettre à jour l'aide affichée avec les nouvelles fonctions (CTRL+souris et TAB),
- Mettre à jour la documentation avec tous les bugs corrigés et les nouveautés,
- Déplacer le panneau "COMMANDES MOTEUR" en bas à côté du panneau "PROPULSION"
- Ajouter des mesures de température de fonctionnement des moteurs, et afficher ces valeurs dans un nouveau panneau en bas à gauche de "PROPULSION"
- Ajouter des anneaux aléatoirement aux planètes gazeuses,
- Ajouter des champs d'astéroïdes aléatoirement (générer au chargement plusieurs modèles de différentes formes et tailles, en respectant les connaissances astrophysiques)

##### Step 3

- Ajouter des modes de suivi caméra, appuyer rapidement 2x sur CTRL change le mode: tracking simple, plans-séquences autour du vaisseau, succession de plans filmant le vaisseau à distance avec en fond des planètes ou des nébuleuses.  3 appuis courts sur CTRL ramènent au mode tracking standard. 
- Les petites navettes de transport doivent être beaucoup moins rapides pour que les messages vocaux soient coordonnés dans le temps.  On peut abréger la séquence pour la terminer rapidement via un appui sur la touche SPACE. 
- En phase d'approche d'une étape, le vaisseau doit ralentir pour commencer les transmissions
- Le panneau "CANAL RADIO" est trop haut sur le HUD, il recouvre le panneau "OBJET LE PLUS PROCHE".
- Juste après l'initialisation, afficher un écran de titre "Space Travel & transport" avec le choix de la langue du jeu : français (existant), anglais, allemand et espagnol à créer.

