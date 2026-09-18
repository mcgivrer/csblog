# Voyage Spatial — Space Travel & Transport

Simulateur de vol spatial procédural, livré sous la forme d'un **unique fichier HTML autonome** (Three.js, WebGL, aucune étape de build). Un cargo pilote automatiquement (ou manuellement) de système en système, livre sa cargaison par navettes à chaque escale, échange par radio avec le contrôle du port, et poursuit son itinéraire dans un univers entièrement généré depuis une seule graine — étoiles, nébuleuses, systèmes planétaires, noms.

Disponible en **français, anglais, allemand et espagnol**, choisi sur l'écran-titre au lancement.

## Lancer le jeu

Aucune installation ni compilation nécessaire :

1. Ouvrir `voyage-spatial.html` directement dans un navigateur récent (Chrome, Firefox, Edge…), en double-cliquant sur le fichier.
2. Une connexion internet est nécessaire au premier chargement (Three.js est chargé depuis un CDN).

**Alternative recommandée**, pour un rendu plus stable selon les navigateurs :

```bash
# depuis le dossier du projet
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/voyage-spatial.html
```

## Fonctionnalités

- Univers procédural déterministe : la même graine reproduit toujours le même univers.
- Étoiles physiquement modélisées (classes spectrales, corps noir, magnitude apparente), nébuleuses, systèmes planétaires (anneaux, astéroïdes, lunes, ports spatiaux).
- Pilotage automatique ou manuel, avec inertie réaliste du vaisseau.
- Séquence d'arrivée à chaque escale : mise en orbite, livraison par navettes, échanges radio doublés d'une synthèse vocale.
- Interface entièrement traduite en 4 langues.

## Captures d'écran

| Interface en français                                                                |
|--------------------------------------------------------------------------------------|
| ![Navigation quantique, cargo Orin-17, approche d'un système binaire](./stt-001.jpg) |
| Interface en anglais                                                                 |
| ![Quantum navigation, cargo Kai-89, plan de vol vers plusieurs ports](./stt-002.jpg) |

## Commandes

*(Correspond à l'état actuel du jeu. Certaines commandes supplémentaires — mode pause, changement de caméra par `F3`, coupure de la voix par `F10`, événements aléatoires — sont à l'état de spécification, voir [`spec-space-travel-evolution-2.0.md`](./spec-space-travel-evolution-2.0.md).)*

### Pilotage

| Touche                                                   | Action                                                                    |
|----------------------------------------------------------|---------------------------------------------------------------------------|
| `↑` `↓` `←` `→`                                          | Orientation (tangage / lacet)                                             |
| `Z` `Q` `S` `D` *(AZERTY)* ou `W` `A` `S` `D` *(QWERTY)* | Équivalents des flèches — les deux dispositions fonctionnent en parallèle |
| `E` / `R`                                                | Roulis                                                                    |
| `MAJ` (Shift) ou `ESPACE`                                | Propulsion (boost)                                                        |
| Glisser la souris                                        | Visée fine / pilotage à la souris                                         |

### Caméra

| Touche                                | Action                                                                        |
|---------------------------------------|-------------------------------------------------------------------------------|
| `CTRL` + glisser la souris            | Regard libre autour du vaisseau                                               |
| Appui court sur `CTRL` (sans glisser) | Recentre le regard libre                                                      |
| Double appui court sur `CTRL`         | Passe au mode de caméra suivant (poursuite → plan-séquence → plans lointains) |
| Triple appui court sur `CTRL`         | Revient directement à la poursuite standard                                   |

### Interface

| Touche | Action                                   |
|--------|------------------------------------------|
| `TAB`  | Affiche/masque le panneau du canal radio |
| `H`    | Affiche/masque la barre d'aide clavier   |

### Séquence d'approche

| Touche               | Action                                                                                           |
|----------------------|--------------------------------------------------------------------------------------------------|
| `ESPACE` ou `ENTRÉE` | Abrège la manœuvre d'approche en cours (mise en orbite/livraison), qui se joue alors en accéléré |

## Structure du projet

| Fichier                              | Contenu                                                                                  |
|--------------------------------------|------------------------------------------------------------------------------------------|
| `voyage-spatial.html`                | Le jeu — fichier unique, autonome                                                        |
| `voyage-spatial-spec.docx`           | Spécification fonctionnelle et technique du simulateur (v2.0)                            |
| `spec-space-travel-evolution-2.0.md` | Spécification des évolutions à venir (pause, économie, événements aléatoires, interface) |
| `space-travel-reqs.md`               | Notes de cadrage d'origine                                                               |

## Feuille de route

Les prochaines évolutions prévues (mode pause, système de crédits, mise en scène des navettes, pannes et événements aléatoires, ajustements d'interface) sont détaillées dans [`spec-space-travel-evolution-2.0.md`](./spec-space-travel-evolution-2.0.md), y compris pour chacune les décisions encore à trancher.
