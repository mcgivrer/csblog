# Documentation Technique — Voyage Spatial

Fichier unique : `demos/space-travel/space-travel.html` (4721 lignes)
Trois.js, WebGL, aucun build — fichier HTML autonome.

---

## 1. Vue d'ensemble

Simulateur de vol spatial procédural en **un seul fichier HTML** (standalone).
- Trois.js r128 chargée depuis CDN
- Shaders GLSL personnalisés
- Déterminisme total via graine unique (seed)
- 4 langues : français, anglais, allemand, espagnol
- Interface HUD interactive, radio, plan de vol, moteur

---

## 2. Internationalisation (i18n)

- Langue choisie à l'écran-titre avant le démarrage
- `LANG` est constant pour toute la session
- Dictionnaires `I18N` : `fr`, `en`, `de`, `es`
- Fonction `t(key)` pour les textes statiques
- `RADIO_TEMPLATES[LANG]` pour les messages radio (fonctions avec interpolation de noms)

**Fichiers de traduction** : définis dans le `<script>` au début du fichier.

---

## 3. PRNG & Seed

Tout l'univers découle de **une seule graine** tirée au démarrage.

```js
// Génération de la seed (unique par session)
const SEED = Date.now().toString(36).toUpperCase() + '-' +
  Math.floor(Math.random()*46656).toString(36).toUpperCase().padStart(3,'0');
```

**PRNGs** :
- `xmur3(str)` → hacheur 32-bit déterministe
- `mulberry32(a)` → PRNG rapide état-unique
- `rngFor(tag)` → `mulberry32(xmur3(tag)())` — graine par tag (reproductible)

La seed s'affiche dans le HUD (`#seedVal`).

---

## 4. Génération de noms

Chaque élément (étoile, planète, nébuleuse) reçoit un nom généré aléatoirement parmi des racines issues de 9 langues (grec, latin, hindi, chinois, français, anglais, russe, espagnol, portugais).

```js
function generateName(rng){
  // choisit 2 langues au hasard, prend un radical de chacune
  // joindre avec '-' ou ' ' (45% de chances '-')
  // 55% d'ajouter un numéro à 3 chiffres
}
```

Exemples : `Thal-Xor`, `Surya-777`, `Lune Noire`, etc.

---

## 5. Modèle Astrophysique des étoiles

Chaque étoile est générée physiquement cohérente depuis la seed.

### 5.1 Classes spectrales & fonction de masse de Salpéter

- 7 classes : M, K, G, F, A, B, O
- Fractions observées dans le voisinage solaire (les naines M dominent à 76.45%)
- Loi `dN/dM ∝ M⁻²·³⁵` échantillonnée par transformation inverse

### 5.2 Classes de luminosité (Yerkes)

- V (naine, 88%), IV (sous-géante, 3%), III (géante, 4.5%), I (supergéante, 0.3%), D (naine blanche, 4.2%)

### 5.3 Température, luminosité, rayon

- **Luminosité** : relation masse-luminosité par domaines
  - M < 0.43 : `L = 0.23 · M²·³`
  - 0.43 ≤ M < 2.0 : `L = M⁴`
  - 2.0 ≤ M < 55 : `L = 1.4 · M³·⁵`
  - M ≥ 55 : `L = 32000 · M`
- **Température** : échantillonnée dans le domaine de la classe spectrale
- **Rayon** : loi de Stefan-Boltzmann `R/R☉ = √L · (T☉/T)²`
- **Couleur** : approximation analytique du lieu planckien (CIE → sRGB)

### 5.4 Naines blanches

- Traitement spécial : température forcée (6000–30000 K), masse 0.5–0.7 M☉
- Luminosité calculée géométriquement depuis le rayon Terre

### 5.5 Magnitude apparente

`m = M_bol + 5·log₁₀(d/10pc)` — loi en carré inverse pour l'éclat perçu.

---

## 6. Types de nébuleuses

9 types avec couleurs cœur/bord personnalisées :
- emission, hii, dark, planetary, supernova, nursery, reflection, molecular, oiii
- Dégradé cœur→bord via mélange linéaire → donne du volume aux quads billboarded

---

## 7. Scène Three.js

```js
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1220, 0.00026);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 6000);

// Lumière directionnelle "soleil local" — fondue en douceur entre les étoiles
const starLight = new THREE.DirectionalLight(0xdfe8ff, 1.0);
```

- AmbientLight faible (0x141c2e, 0.55)
- Éclairage dynamique suivant l'étoile dominante (flux reçu ∝ luminosité/d²)
- Mise à jour à chaque frame via `updateStarLighting(dt)`

---

## 8. HUD (Heads-Up Display)

Éléments UI en CSS positionné au-dessus du canvas WebGL.

| Élément | Description |
|---|---|
| `#hud-top` | Marque (NAVIGATION QUANTIQUE/QUANTUM NAVIGATION), crédits, seed, statut en ligne |
| `#hud-mode` | Badge AUTOPILOTE/MANUEL/MISE EN ORBITE |
| `#hud-left` | Panneau vitesse, secteur, cap |
| `#hud-route` | Plan de vol avec étapes (navigation vers les ports) |
| `#hud-right` | Objet le plus proche (nom, meta) |
| `#hud-bottom-row` | Rangée fixe : température moteur, propulsion, commandes moteur |
| `#hud-radio` | Canal radio (affichage/cachage lors des approches) |
| `#hud-hint` | Raccourcis clavier en permanence |
| `#boot` | Écran de démarrage |
| `#titleScreen` | Choix de langue au démarrage |

**Responsive** : masque les panneaux non essentiels en dessous de 760px ou 900px.

---

## 9. Contrôles clavier & souris

### Clavier (AZERTY/QWERTY support)

| Touche | Action |
|---|---|
| `↑ ↓ ← →` / `Z Q S D` | Orientation (tangage/lacet) |
| `E` / `R` | Roulement |
| `Shift` / `Espace` | Propulsion (boost) |
| `F3` | Changement de caméra |
| `F10` | Coupure de la voix (TTS) |
| `TAB` | Panneau canal radio |
| `H` | Barre d'aide clavier |

### Souris

- Glisser : visée fine / pilotage souris
- `Ctrl` + glisser : regard libre autour du vaisseau
- Appui court `Ctrl` : recentrer regard libre
- Double appui `Ctrl` : passer au mode de caméra suivant
- Triple appui `Ctrl` : retour à la poursuite standard

### Commandes moteur (panneau bas)

- Trois affichages : température, propulsion, commandes
- jauges proportionnelles à l'état du vaisseau

---

## 10. Système radio

Pendant les approches de port, des messages s'affichent dans le panneau radio.

**Templates par langue** : fonctions qui interpolent noms d'équipage, ville contrôle, label navette, nombre de conteneurs.

Exemple français :
- `hail` : "Contrôle [city], ici [ship], cargo en approche, demande autorisation de mise en orbite."
- `dropoff` : "Contrôle [city], largage de [label], [n] conteneur(s) à bord, cap sur le port."
- `techQuery` : "[ship], confirmez le blindage thermique de vos navettes avant rentrée."
- etc.

Messages affichés avec animation d'entrée (`radioIn`).

---

## 11. Architecture du flux principal

1. **Démarrage** : écran de boot → écran choix de langue → initialisation du PRNG avec seed
2. **Génération** : étoile dominante, champ d'étoiles décoratives, système planétaire tous issus de la seed
3. **Boucle de jeu** : `requestAnimationFrame` → mise à jour du vaisseau, des étoiles, des labels, du HUD, de la lumière
4. **Pilotage** : clavier/souris modifie l'état du vaisseau (vitesse, rotation, propulsion)
5. **Approche** :Lorsqu'on approche d'un port, le canal radio s'ouvre, séquence de livraison, puis nouveau itinéraire

---

## 12. Limitations connues

- Aucune étape de build / compilation — fichier HTML ouvert directement
- Three.js chargé depuis CDN (nécessite connexion internet au premier chargement)
- Pas de modèle 3D importé : tout le vaisseau et les planètes sont géométries primitives Three.js
- Pas de préchargement d'assets : tout est généré procéduralement
- La seed est générée à partir de `Date.now()` + hasard — reproductible si on fixe la seed manuellement

---

## 13. Points d'entrée & exports

Aucun fichier externe — tout est contenu dans `space-travel.html`. Les éléments clés accessibles :
- `SEED` (variable globale)
- `I18N` (dictionnaires de traduction)
- `RADIO_TEMPLATES` (templates radio par langue)
- `STAR_SAMPLE`, `STAR_FIELD` (données stellaires générées)
- `SHIP_RIG` (état du vaisseau)
- `generateStar(rng)` (fonction de génération stellaire)
- `applyLanguage()` (applique la langue courante)