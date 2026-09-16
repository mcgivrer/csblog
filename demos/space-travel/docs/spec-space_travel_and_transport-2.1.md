# Space Travel & Transport — Spécification v2.1

**Format :** Markdown avec captures d'écran, schémas SVG et diagrammes mermaid **intégrés directement dans le fichier** (images en base64) — un seul fichier `.md`, aucun dossier annexe requis.

**Ce qui change depuis la v2.0** (DOCX) : plusieurs évolutions qui y étaient décrites comme de simples propositions sont désormais **réellement implémentées et vérifiées** dans `voyage-spatial.html` — le système de crédits, les raccourcis F3/F10, l'élargissement du panneau de plan de vol, le correctif du roulis, et surtout la mise en scène cinématique des navettes avec un dock physique sous le vaisseau et un habillage texturé de la coque. Ce document sépare nettement, comme la v2.0, ce qui existe (Partie I) de ce qui reste à construire (Partie II) — mais la frontière entre les deux s'est déplacée.

---

## Sommaire

**Partie I — État actuel du simulateur**
- [1. Vue d'ensemble](#1-vue-densemble)
- [2. Univers procédural](#2-univers-procédural)
- [3. Le vaisseau](#3-le-vaisseau)
- [4. Commandes de vol et caméra](#4-commandes-de-vol-et-caméra)
- [5. Navigation — plan de vol](#5-navigation--plan-de-vol)
- [6. Systèmes planétaires](#6-systèmes-planétaires)
- [7. Séquence d'arrivée : orbite, navettes, crédits](#7-séquence-darrivée--orbite-navettes-crédits)
- [8. Interface (HUD)](#8-interface-hud)
- [9. Architecture technique](#9-architecture-technique)
- [10. Internationalisation](#10-internationalisation)

**Partie II — Évolutions restant à implémenter**
- [11. Mode Pause](#11-mode-pause)
- [12. Barre de contrôle du HUD](#12-barre-de-contrôle-du-hud)
- [13. Événements aléatoires et réparations](#13-événements-aléatoires-et-réparations)
- [14. Dialogues radio générés par IA embarquée (Gemini Nano)](#14-dialogues-radio-générés-par-ia-embarquée-gemini-nano)
- [15. Contrôle tactile pour appareils portables](#15-contrôle-tactile-pour-appareils-portables)
- [16. Plan d'implémentation](#16-plan-dimplémentation)
- [17. Référence — tous les raccourcis clavier](#17-référence--tous-les-raccourcis-clavier)

---

# Partie I — État actuel du simulateur

## 1. Vue d'ensemble

Simulateur de vol spatial procédural, livré en **un unique fichier HTML autonome** (Three.js r128, WebGL, aucune étape de build). Un cargo pilote automatiquement — ou manuellement — de système en système, livre sa cargaison par navettes à chaque escale, échange par radio avec le contrôle du port, gagne des crédits, et poursuit son itinéraire dans un univers entièrement généré depuis une seule graine. Interface disponible en français, anglais, allemand et espagnol, choisie sur l'écran-titre.

![Écran-titre](images/img-001.jpg)

![Vue de croisière — HUD complet](images/img-002.jpg)

```mermaid
flowchart LR
    A[Écran-titre<br/>choix de la langue] --> B[Croisière<br/>pilotage auto/manuel]
    B --> C[Approche d'une étape<br/>mise en orbite]
    C --> D[Livraison par navettes<br/>+ dialogue radio]
    D --> E[Crédits gagnés]
    E --> F{Dernière étape<br/>de l'itinéraire ?}
    F -- non --> B
    F -- oui --> G[Nouvel itinéraire calculé]
    G --> B
```

## 2. Univers procédural

Tout — étoiles, nébuleuses, systèmes planétaires, noms — découle d'une seule graine (`SEED`) via des générateurs pseudo-aléatoires dédiés. Rejouer la même graine reproduit exactement le même univers.

- **Étoiles** physiquement modélisées : classes spectrales (fractions de Salpeter), couleur par lieu planckien, luminosité/masse/rayon par lois astrophysiques, magnitude apparente calculée en fonction de la distance.
- **Nébuleuses** procédurales (bruit fBm 4 canaux), apparition progressive pour éviter tout effet de « pop » visuel.
- **Étiquettes de désignation** : cercle de ciblage + flèche, pour étoiles, planètes et lunes — vocabulaire visuel cohérent dans tout le HUD.

![Vue de croisière avec nébuleuse](images/img-003.jpg)

```mermaid
flowchart TD
    SEED[Graine SEED] --> ST[Étoiles<br/>classe spectrale, couleur, luminosité]
    SEED --> NB[Nébuleuses<br/>bruit fBm, 9 types]
    SEED --> SYS[Systèmes planétaires]
    SEED --> NM[Noms de lieux, ports, équipage]
    SYS --> PL[Planètes<br/>océanique/continental/désertique/glacé/volcanique/gazeux]
    PL --> RG[Anneaux — géantes gazeuses, ~50%]
    SYS --> AST[Ceintures d'astéroïdes<br/>dans le vide entre deux orbites]
```

## 3. Le vaisseau

Porte-conteneurs low-poly en deux blocs : une nacelle cargo à claire-voie à l'avant, reliée par une épine dorsale à un bloc propulsif arrière massif portant la passerelle et une grappe de quatre réacteurs.

![Vaisseau en approche, coque texturée](images/img-004.jpg)

**Nouveauté v2.1 — habillage de la coque.** Les quatre matériaux réutilisés dans tout le vaisseau (coque, pont, panneaux sombres, cadres) portent désormais une texture procédurale générée par canvas — grille de panneaux à teinte légèrement désaccordée, joints marqués, greebles épars (capots, ouïes), bandes de danger jaune/noir ponctuelles. Inspirée de vaisseaux cargo façon *Homeworld*, sans dépendance à une image externe : cohérent avec le reste du fichier, qui génère déjà ses textures d'anneaux et de planètes de la même manière. Une texture par matériau suffit à habiller l'ensemble de la silhouette ; les navettes ont leur propre texture, générée une seule fois au chargement plutôt qu'à chaque largage.

**Nouveauté v2.1 — dock de navettes.** Une baie éclairée en bleu, en saillie sous le bloc arrière (propulseurs) — pas sous la nacelle cargo, où elle se serait retrouvée occultée par le volume des conteneurs. Puits + cadre métallique + surface émissive + double halo additif (cœur serré, halo large) + point light à courte portée qui illumine réellement la coque alentour, avec une respiration douce plutôt qu'un clignotement. Les navettes partent réellement de ce point, pas du centre du vaisseau.

## 4. Commandes de vol et caméra

| Touche | Action |
|---|---|
| `↑ ↓ ← →` / `Z Q S D` (AZERTY) / `W A S D` (QWERTY) | Orientation |
| `E` / `R` | Roulis *(corrigé en v2.1 — l'aide affichait par erreur `A / E`)* |
| `MAJ` ou `ESPACE` | Propulsion (boost) |
| Glisser la souris | Visée fine |
| `CTRL` + glisser | Regard libre |
| `F3` | Mode de caméra suivant *(nouveau v2.1)* |

**Nouveauté v2.1 — F3.** Le changement de mode de caméra (poursuite standard → plan-séquence → plans lointains) se fait désormais par une simple pression sur `F3`, qui remplace l'ancien mécanisme de double/triple appui sur `CTRL`. Ce dernier — sensible aux conditions de rendu lors de sa validation initiale — a été **entièrement retiré** plutôt que complété : `CTRL` retrouve un rôle unique (regard libre en glissé, recentrage en appui court), sans plus avoir besoin d'un minuteur pour distinguer un, deux ou trois appuis.

## 5. Navigation — plan de vol

![Panneau de plan de vol élargi](images/img-005.jpg)

**Correctif v2.1 — largeur du panneau.** Mesuré dans le code : le panneau ne faisait que 230 px de large, avec numéro/nom/désignation stellaire sur une seule ligne — largement insuffisant face aux noms de ports générés, d'où des troncatures fréquentes. Deux ajustements combinés : élargissement modéré à 300 px, **et** passage à un gabarit deux lignes par étape (nom en pleine largeur, désignation stellaire en dessous, atténuée). La troncature reste en filet de sécurité pour les rares noms encore trop longs.

```mermaid
flowchart LR
    A["Avant : 230 px,<br/>1 ligne par étape"] --> B["v2.1 : 300 px,<br/>2 lignes par étape"]
    B --> C{Nom encore<br/>trop long ?}
    C -->|non, cas courant| D[Affichage complet]
    C -->|oui, rare| E[Troncature ellipsis<br/>— filet de sécurité]
```

La route est planifiée via une courbe de Catmull-Rom passant par chaque étoile puis chaque planète cible, avec deux passes de sécurité qui écartent toute planète — ciblée ou non — qui se retrouverait trop près du tracé (vérifié sans collision sur 150 itinéraires générés aléatoirement).

![Portiques de navigation](images/img-006.jpg)

## 6. Systèmes planétaires

![Systèmes planétaires : anneaux et astéroïdes](images/img-007.jpg)

- 2 à 3 planètes par système, une habitable (port spatial).
- Espacement orbital en croissance géométrique (esprit Titius-Bode), avec garantie mathématique de zéro chevauchement quel que soit l'angle orbital.
- Anneaux pour ~50 % des géantes gazeuses ; champs d'astéroïdes placés dans le **vide** entre deux orbites, jamais sur l'orbite d'une planète.

![Approche d'une planète](images/img-008.jpg)

## 7. Séquence d'arrivée : orbite, navettes, crédits

À chaque étape (pas seulement la dernière), le vaisseau ralentit à l'approche, se met en orbite, et livre sa cargaison.

![Mise en orbite et livraison](images/img-009.jpg)

```mermaid
sequenceDiagram
    participant V as Vaisseau
    participant N as Navettes
    participant R as Contrôle du port
    V->>V: Ralentissement à l'approche
    V->>V: Capture en orbite
    R-->>V: Autorisation de mise en orbite
    loop pour chaque navette
        V->>N: Largage depuis le dock (bloc arrière)
        N->>N: Séquence caméra tirée au hasard
        N->>R: Livraison des conteneurs
        R-->>V: Confirmation
    end
    V->>V: Crédits += conteneurs × prix unitaire
    V->>V: Reprise de la croisière
```

**Nouveauté v2.1 — mise en scène des navettes.** Un catalogue de quatre séquences de plans, tirée au hasard à chaque largage (seedée, donc reproductible pour une même graine) :

| Séquence | Gros plan initial | Puis |
|---|---|---|
| Latérale rapprochée | Dock vu de côté, contre-plongée | Coupure franche vers un suivi à distance |
| Face avant | La navette vient droit vers la caméra | Suivi latéral large, le port entre dans le cadre |
| Travelling continu | Dock en gros plan | Éloignement progressif, sans aucune coupure |
| Sur l'épaule | Dock en gros plan | Plan fixe solidaire du vaisseau |

La coupure franche (pour les trois premières séquences) a été vérifiée par instrumentation directe : saut de caméra de plus de 120 unités en une seule image, exactement à l'instant prévu — pas un fondu progressif.

**Nouveauté v2.1 — crédits.** 1 à 5 conteneurs tirés par escale, répartis entre les navettes réellement larguées — et c'est cette même répartition qui alimente le dialogue radio, pour que l'équipage n'annonce jamais un chiffre sans rapport avec ce qui est effectivement crédité. Gain versé au moment où le dernier conteneur atterrit. Solde initial de 10 000 crédits, affiché dans la barre supérieure à gauche de `SEED`.

![Crédits et canal radio](images/img-010.jpg)

```mermaid
flowchart TD
    A[Déclenchement de l'arrivée] --> B[Tirage : 1 à 5 conteneurs]
    B --> C[Répartition entre les navettes larguées]
    C --> D[Dialogue radio annonce le nombre exact par navette]
    D --> E[Atterrissage de la dernière navette]
    E --> F[Crédits += Σ conteneurs × prix unitaire]
    F --> G[Flash ambre sur le HUD]
```

Le canal radio combine dialogue textuel et synthèse vocale (voix tirée aléatoirement masculine/féminine pour chaque interlocuteur), avec bips synthétisés à l'apparition de chaque message.

![Canal radio en cours d'échange](images/img-011.jpg)

## 8. Interface (HUD)

![Jauges de propulsion et télémétrie](images/img-012.jpg)

Panneaux : Vitesse/Secteur/Cap, Plan de vol, Objet le plus proche, Température moteur, Propulsion, Commandes moteur, Canal radio (bascule `TAB`). Aide clavier (`H`) tenue à jour avec tous les raccourcis actuels, y compris `F3`/`F10`.

## 9. Architecture technique

![Architecture générale](images/img-013.png)
![Pipeline de génération stellaire](images/img-014.png)
![Disposition des propulseurs RCS](images/img-015.png)
![Boucle de contrôle du pilotage automatique](images/img-016.png)
![Poursuite de la courbe de navigation](images/img-017.png)
![Génération d'un système planétaire](images/img-018.png)
![Streaming des systèmes construits](images/img-019.png)
![Séquence de mise en orbite](images/img-020.png)

## 10. Internationalisation

Français, anglais, allemand, espagnol — dictionnaire `I18N` couvrant les libellés du HUD, les gabarits de dialogue radio (paramétrés, pas des chaînes figées), et la langue de la synthèse vocale. Choisie une fois sur l'écran-titre, appliquée pour toute la session.

---

# Partie II — Évolutions restant à implémenter

Les chantiers suivants restent au stade de spécification : ils ne sont **pas** présents dans le fichier livré aujourd'hui.

## 11. Mode Pause

```mermaid
stateDiagram-v2
    [*] --> TitleScreen
    TitleScreen --> Jeu: langue choisie
    state Jeu {
        [*] --> Cruise
        Cruise --> Arrival: étape atteinte
        Arrival --> Cruise: livraison terminée
    }
    Jeu --> Paused: ESC / P / Pause
    Paused --> Jeu: Espace / Entrée (reprise à l'état exact)
    Paused --> TitleScreen: ESC (nouvelle partie)
```

`ÉCHAP`, `P` ou `PAUSE` gèle entièrement la simulation (route, rotation, températures, navettes) et suspend la synthèse vocale sans l'annuler. `ESPACE`/`ENTRÉE` reprend exactement où le jeu en était ; `ÉCHAP` depuis la pause renvoie à l'écran-titre (abandon de session, nouvelle graine à la prochaine sélection de langue).

![États du mode Pause](images/img-021.png)

⚠️ Le code actuel utilise déjà `ARRIVAL_PAUSE`/`paused` pour la mise en orbite — sans rapport avec ce nouveau mode. Renommer (`ARRIVAL_PAUSE`→`ARRIVAL`, `paused`→`arriving`) avant d'introduire `gamePaused`.

## 12. Barre de contrôle du HUD

Une barre d'icônes fixe, en bas à gauche, pour afficher/masquer indépendamment chacun des sept panneaux du HUD — plus un huitième bouton dupliquant l'action de `F3`. Quand les sept panneaux sont masqués, seuls la ligne d'en-tête et cette barre restent visibles. Chaque bouton : icône distincte, infobulle traduite, état visuel actif/inactif.

## 13. Événements aléatoires et réparations

```mermaid
stateDiagram-v2
    [*] --> Nominal
    Nominal --> Surchauffe: température > seuil critique
    Surchauffe --> Nominal: refroidit avant 8 s cumulées
    Surchauffe --> Alerte: 8 s cumulées au-dessus du seuil
    state Alerte {
        [*] --> FenêtreIntervention
        FenêtreIntervention --> Éteint: touche I dans les 6 s
        FenêtreIntervention --> Échec: délai dépassé
    }
    Éteint --> HorsService: réacteur coupé, dégât à réparer
    Échec --> HorsServiceAggravé: réacteur perdu + propagation
```

Trois familles d'incidents partageant un même aval — un dégât à réparer à l'escale suivante :

- **Incendie moteur** (§ ci-dessus) : intervention par la touche `I`, fenêtre de 6 secondes.
- **Pannes diverses** : radar, propulseurs RCS, autopilote — chacune avec son malus propre en vol.
- **Attaques de pirates** : trois profils de menace (navette, intercepteur, croiseur), dialogue à choix (payer / résister / fuir), bordure colorée selon le type d'événement (ambre = panne, rouge = menace hostile).

```mermaid
flowchart TD
    F[Incendie moteur] --> D[Dégât en attente]
    P[Panne diverse] --> D
    A[Attaque de pirates] --> D
    D --> M[Malus appliqué en vol]
    M --> N[Étape suivante : livraison]
    N --> S[Panneau services portuaires]
    S --> R{Réparer ?}
    R -->|oui, solde suffisant| Z[Dégât levé, crédits débités]
    R -->|non| M
```

La réparation se propose dans le même panneau « services portuaires » qui gère déjà la dépense de crédits — les deux mécaniques convergent naturellement au même point de la boucle de jeu.

## 14. Dialogues radio générés par IA embarquée (Gemini Nano)

Principe : quand c'est possible, remplacer les dialogues radio générés par gabarits (§7, §13) par une génération dynamique via le LLM embarqué dans Chrome (Gemini Nano, exposé par la *Prompt API*), avec repli automatique et transparent vers le mécanisme existant quand ce LLM n'est pas disponible.

**Ce choix ne trahit pas la philosophie « zéro dépendance externe » du projet** : Gemini Nano tourne **en local dans le navigateur** — aucun appel réseau, aucune clé API, exactement le même principe que `SpeechSynthesis`, déjà utilisé pour la voix (§7). Ce n'est pas un service cloud, c'est une capacité du navigateur.

### 14.1 Détection et repli

```mermaid
flowchart TD
    A[Approche d'une étape /<br/>panne / attaque de pirates] --> B{"'LanguageModel' in self ?"}
    B -->|non| F[Voie gabarits<br/>mécanisme existant §7/§13]
    B -->|oui| C["await LanguageModel.availability()"]
    C -->|"'no'"| F
    C -->|"'after-download'"| F
    C -->|"'readily'"| D[Voie IA<br/>génération par persona]
    D -->|délai dépassé ou erreur| F
    D -->|succès| E[Panneau CANAL RADIO]
    F --> E
```

Les deux voies alimentent le **même** panneau, avec la même mise en forme et la même synthèse vocale — le joueur ne doit percevoir aucune différence selon que Gemini Nano est disponible ou non sur son poste.

### 14.2 Personæ — une identité par interlocuteur

Chaque interlocuteur reçoit un profil de personnalité propre (ton, registre de vocabulaire, longueur habituelle des répliques), fourni comme instruction système à sa propre session `LanguageModel` — plutôt qu'un seul modèle générique appelé plusieurs fois, ce qui produirait des répliques interchangeables.

| Interlocuteur | Registre proposé |
|---|---|
| Capitaine du cargo | Direct, professionnel, phrases courtes — un pilote qui économise sa salive |
| Contrôle du port | Protocolaire, débit posé, formules consacrées (« autorisation accordée », « trajectoire confirmée ») |
| Pilotes de navette | Familier, argot de métier, plus bavard que le capitaine |
| *(à venir)* Capitaine pirate | Menaçant ou goguenard selon le profil de menace (§13.3) |

### 14.3 Contextes d'usage

| Contexte | État | Section concernée |
|---|---|---|
| Livraison de conteneurs | actuel (gabarits) → IA en option | §7 |
| Pannes et avaries | à venir | §13.1, §13.2 |
| Attaques de pirates | à venir | §13.3 |

### 14.4 Tension avec le déterminisme — question ouverte

Point de friction réel avec le principe fondateur du simulateur (§2) : **tout** l'univers découle d'une seule graine, reproductible à l'identique. Une génération par LLM, même à prompt fixe, n'est **pas déterministe** (échantillonnage probabiliste) — les API navigateur actuelles n'exposent pas de paramètre de graine pour Gemini Nano.

Trois options, aucune tranchée :

- **Accepter l'exception** : le dialogue devient la seule partie non reproductible de l'univers — assumé, documenté, sans conséquence sur le gameplay (le dialogue est décoratif, pas mécanique).
- **Mettre en cache par graine** : stocker les répliques générées pour un `(seed, contexte)` donné, les réutiliser si la même graine revient — reproductible au prix d'un stockage persistant à ajouter.
- **Ne l'activer que hors mode « défi seedé »** *(si un tel mode existait)* : l'IA embellit les parties libres, les gabarits déterministes restent pour toute reproduction exacte demandée.

### 14.5 Performance et latence

L'inférence locale n'est pas instantanée. La génération doit être déclenchée **en avance** — dès le début de la manœuvre d'approche, avant que le message ne soit affiché — jamais en bloquant l'affichage du panneau radio. Un délai dépassé (proposition : 2 s) déclenche le repli vers les gabarits pour CE message précis, sans abandonner la tentative IA pour les messages suivants du même échange.

---

## 15. Contrôle tactile pour appareils portables

*(Aucune trace d'une étude antérieure de ce chantier n'a été retrouvée dans les échanges accessibles — les maquettes ci-dessous sont une première proposition, pas la reprise d'un travail déjà validé.)*

Le simulateur repose entièrement sur clavier + souris (§4). Sur smartphone et tablette, ni l'un ni l'autre n'existe : il faut un jeu de contrôles tactiles complet, et une disposition des panneaux qui s'adapte à un écran nettement plus petit — et à son orientation.

### 15.1 Principes directeurs

- **Aucun panneau d'information n'est indispensable en permanence** : contrairement au clavier où `TAB`/`H` bascule un panneau à la fois, le tactile a besoin d'un contrôle centralisé pour libérer de l'espace à la demande — ce qui rejoint directement la barre de contrôle du HUD déjà spécifiée en §12, plutôt que d'inventer un second mécanisme.
- **Le pilotage ne doit jamais être capté par un panneau ouvert** : les zones tactiles de pilotage (joystick, boutons) restent actives même quand un panneau est déployé par-dessus la vue 3D.
- **Glisser un doigt = regarder autour**, en reprenant l'esprit du `CTRL` + glisser souris existant, mais sans modificateur à maintenir (le tactile n'a pas d'équivalent naturel à `CTRL` maintenu) — un doigt suffit, puisqu'aucune autre action tactile ne partage cette même zone.

### 15.2 Maquette portrait (smartphone)

![Maquette portrait — smartphone](images/img-022.png)

En portrait, la largeur ne permet pas de garder un panneau d'info ouvert sans masquer une bonne partie de la vue. Seuls restent visibles en permanence : la barre du haut réduite (immatriculation, crédits, statut) et deux boutons d'icône — un menu déroulant qui ouvre les panneaux un par un (réutilise §12), et un accès direct au canal radio (le plus consulté en jeu).

| Zone tactile | Équivalent clavier/souris |
|---|---|
| Joystick virtuel (bas gauche) | Flèches / ZQSD — tangage et lacet |
| Boutons ⟲ / ⟳ (bas centre) | E / R — roulis |
| Bouton BOOST, maintenu (bas droite) | MAJ / ESPACE — propulsion |
| Glisser un doigt sur la vue 3D | Glisser la souris — visée fine |
| Icône menu (haut gauche) | H — aide / accès à la barre du §12 |
| Icône radio (haut droite) | TAB — canal radio |

### 15.3 Maquette paysage (tablette)

![Maquette paysage — tablette](images/img-023.png)

Le paysage offre assez de largeur pour garder plusieurs panneaux réduits visibles en continu (vitesse/cap, plan de vol, objet le plus proche), plus la barre d'icônes du §12 en haut au centre — chaque icône affiche ou masque un panneau, exactement comme prévu pour desktop, simplement à portée du pouce plutôt que du curseur. Un bouton **CAM** dédié reprend l'action de `F3` (§4), le changement de mode caméra n'ayant pas d'équivalent naturel au glisser tactile.

### 15.4 Disposition selon l'orientation

```mermaid
flowchart LR
    A[Rotation de l'écran détectée] --> B{Orientation}
    B -->|Portrait| C[Panneaux repliés par défaut<br/>menu déroulant + radio seuls visibles]
    B -->|Paysage| D[Panneaux réduits visibles en continu<br/>+ barre d'icônes du §12]
    C -.->|bascule| D
    D -.->|bascule| C
```

Le changement d'orientation ne réinitialise aucun état de jeu — seule la disposition du HUD se recalcule, sur le même principe que le redimensionnement de fenêtre déjà géré côté desktop.

### 15.5 Points restant à trancher

- Faut-il un mode « une main » (joystick + boost regroupés d'un même côté), pour tenir l'appareil de l'autre main ?
- Le glisser-regard doit-il être désactivable séparément (certains joueurs préférant piloter uniquement au joystick, sans jamais quitter le cap des yeux) ?
- Faut-il une gâchette tactile dédiée pour abréger une manœuvre (équivalent ESPACE/ENTRÉE/ÉCHAP, §10.4), ou ce geste reste-t-il un bouton classique dans le panneau déroulé ?


## 16. Plan d'implémentation

Le **palier 0** de la spécification précédente (six étapes sans dépendance) est désormais **entièrement livré** : correctif de l'aide, largeur du plan de vol, F10, F3, crédits, et mise en scène des navettes. Les paliers suivants restent à faire.

![Paliers d'implémentation](images/img-024.png)

```mermaid
flowchart TD
    subgraph L0["Palier 0 — LIVRÉ"]
        A1[1 Correctif aide ✓]
        A2[2 Largeur plan de vol ✓]
        A3[3 F10 ✓]
        A4[4 F3 ✓]
        A5[5 Crédits ✓]
        A6[6 Mise en scène navettes ✓]
    end
    subgraph L1["Palier 1 — à faire"]
        B7[7 Mode Pause]
        B8[8 Barre d'icônes HUD]
        B9[9 Coquille services portuaires]
    end
    subgraph L2["Palier 2 — à faire"]
        C10[10 Incendie + squelette dégâts/réparation]
    end
    subgraph L3["Palier 3 — à faire"]
        D11[11 Pannes diverses]
        D12[12 Attaques de pirates]
    end
    A4 -.->|confort| B7
    A5 --> B9
    B9 --> C10
    C10 --> D11
    C10 --> D12
```

Économie de la boucle de jeu, telle qu'elle fonctionne aujourd'hui pour la partie crédits, et vers laquelle convergeront les réparations :

![Boucle économique](images/img-025.png)

## 17. Référence — tous les raccourcis clavier

| Touche | Action | État |
|---|---|---|
| `↑ ↓ ← →` / `ZQSD` / `WASD` | Orientation | actuel |
| `E` / `R` | Roulis | actuel *(corrigé v2.1)* |
| `MAJ` / `ESPACE` | Propulsion | actuel |
| Glisser la souris | Visée fine | actuel |
| `CTRL` + glisser | Regard libre | actuel |
| `CTRL` (appui court) | Recentre le regard libre | actuel |
| `F3` | Mode de caméra suivant | **actuel (v2.1)** |
| `TAB` | Affiche/masque le canal radio | actuel |
| `H` | Affiche/masque l'aide | actuel |
| `F10` | Coupe/rétablit la voix de synthèse | **actuel (v2.1)** |
| `ESPACE` / `ENTRÉE` | Abrège la manœuvre d'approche | actuel |
| `I` | Intervenir sur un incendie moteur | à venir (§13) |
| `ÉCHAP` / `P` / `PAUSE` | Bascule en mode Pause | à venir (§11) |
| `ÉCHAP` (en pause) | Retour à l'écran-titre | à venir (§11) |

### Touches à sens multiple

| Touche | Sens selon le contexte |
|---|---|
| `ESPACE` | Propulsion (croisière) · Abrégé (approche) · *Reprise (pause, à venir)* |
| `CTRL` | Regard libre si maintenu et glissé · Recentrage si appui court seul |
