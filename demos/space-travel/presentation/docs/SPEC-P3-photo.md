# Présentation « Voyage Spatial » — lot P3 : direction photo « Cinéma »

## 1. Brief (chef de projet)

**Objectif.** Habiller l'image du réalisateur comme une prise de vue de cinéma : bloom HDR, halation, profondeur de champ
et ouverture, flare anamorphique, grain, vignettage, aberration, bandes 2.39, étalonnage, adaptation d'exposition ;
CRT réservé à de rares transitions. Effets tirés au hasard, mais motivés et cohérents (principe : la beauté du plan).

**Critères d'acceptation.**

1. Un « look » par système (séquence), tiré parmi quatre familles inspirées du cinéma ; variations par plan.
2. Effets motivés : flare et fantômes seulement si l'étoile est à l'écran (intensité selon sa visibilité) ; profondeur de
   champ marquée seulement quand le plan a un premier plan ou une bascule de point ; CRT seulement à l'ouverture d'un
   système, rarement.
3. Même rendu que le jeu sans effet (la chaîne part de l'image exacte du jeu) ; fondu au noir du réalisateur respecté.
4. Coût borné : effets à demi ou quart de résolution, une seule passe pleine résolution en sortie (plus le rendu de la scène).
5. Page `dist/photo-test.html` (réalisateur + direction photo, comparaison avant/après) ; test `tests/photo_test.py`.

## 2. Spécification technique (architecte)

### 2.1 Fichiers

| Fichier | Rôle |
|---|---|
| `presentation/src/photo.js` | **nouveau** : `window.__PHOTO.create(renderer, opts)` — passes et directeur photo |
| `presentation/src/photo-test.js` + `src/html/photo-test.template.html` | démonstration |
| `presentation/tests/photo_test.py` | test |
| `shared/cosmos.js` | ajout de `W.depthBodies()` : sphères (étoile, planètes, lunes, roches) et anneaux pour la carte de distance |

### 2.2 Chaîne de passes (three r128, quad plein écran, sans `EffectComposer`)

| # | Passe | Résolution |
|---|---|---|
| 1 | rendu du monde (`W.render`) dans une cible 8 bits, encodage sRGB + ACES comme à l'écran, MSAA ×4 en WebGL 2 | pleine |
| 2 | **carte de flou** : distance analytique par pixel (rayon → sphères et anneaux du système, au plus 40), cercle de confusion `K·(1 − point/d)` | ½ |
| 3 | préparation : couleur prémultipliée par le flou ; flou gaussien séparable (A), puis (B) ; flou de premier plan seul, étalé | ½, ¼ |
| 4 | **bloom** : extraction des hautes lumières (seuil doux), 4 niveaux sous-échantillonnés et flous | ¼ → 1/32 |
| 5 | **flare anamorphique** : hautes lumières autour de l'étoile, filtre de traînée de Kawase (3 passes, pas 1, 4, 16) | ¼ |
| 6 | **exposition** : luminance moyenne 16×16, puis 1×1 lissée dans le temps (iris) | 16², 1² |
| 7 | **composition** : profondeur de champ, bloom, halation, traînée, fantômes, exposition, étalonnage, aberration, vignettage, grain, bandes, fondu, CRT | pleine |

L'image du jeu est en espace d'affichage (les shaders des astres écrivent directement, les matériaux de three passent par
ACES + sRGB) : les effets travaillent donc dans cet espace, et la sortie n'est pas réencodée. Sans effet (`enabled =
false`), la passe 7 recopie l'image : identique au jeu.

### 2.3 Looks (un par système) et variations par plan

| Look | Inspiration | Étalonnage | Bandes | Flare | Grain |
|---|---|---|---|---|---|
| `denis` | Villeneuve (Dune, Blade Runner 2049) | désaturé, ombres froides, hautes lumières chaudes, contraste fort | 2.39 | anamorphique bleu | moyen |
| `imax` | Nolan (Interstellar) | naturel, légèrement chaud | 1.90 | anamorphique discret | fin |
| `kodak` | tirage 2383 | chaud, noirs denses, halation marquée | 2.39 | ambre | marqué |
| `kubrick` | 2001 | neutre froid, propre | 2.20 | sphérique (fantômes seuls) | très fin |

Par plan (`D.meta.type`) : ouverture (profondeur de champ) forte pour `lune`, `ceinture`, `anneaux`, `nebuleuse`,
faible ailleurs ; flare plus marqué pour `croissant`, `eclipse`, `limbe`. CRT : 15 % des ouvertures de système, 1,6 s.
Révisé à la revue (§ 3) : profondeur de champ seulement sur ces quatre types, nette ailleurs.

### 2.4 API

```js
const PH = __PHOTO.create(renderer, { seed, look: 'auto', crtChance: .15 });   // look : 'auto' | 'denis' | 'imax' | 'kodak' | 'kubrick'
PH.render(W, camera, D.meta, dt)   // remplace W.render : monde → effets → écran
PH.update(D.meta, dt)              // réglages seuls, sans rendu (image non dessinée : onglet caché, tests)
PH.enabled = false                 // image du jeu, sans effet (comparaison)
PH.wipe = .5                       // avant | après : la moitié gauche sans effet
PH.state                           // { lookName, look, aperture, K, flare, streak, ghost, crt, bar, dof… } (lecture)
PH.setLook(name), PH.setLetterbox(ratio | null | undefined), PH.forceCRT(durée), PH.debug = 'coc' | null
__PHOTO.LOOKS, __PHOTO.SHOT        // tables des looks et des réglages par type de plan
```

### 2.5 Vérification

Test en temps virtuel : aucune erreur ; image noire pendant le noir entre deux systèmes ; bandes noires du look ;
CRT absent hors ouverture de système ; carte de flou non nulle sur un plan `lune` ; luminance moyenne des plans
comparable avec et sans effets (pas de surexposition) ; planche avant/après.

## 3. Revue (architecte) et vérification (développeur) — 05/10/2026

- Écarts à la spécification, approuvés :
  - **le sujet au point est net en entier** : chaque astre est pris en bloc dans la carte de flou (profondeur ramenée
    dans `[d − r, d + r]`) ; avec une distance par pixel, une planète proche, plus profonde que sa distance au point,
    était floue sur ses bords. Les anneaux gardent une distance par pixel (l'anneau devant la planète se floute) ;
  - profondeur de champ réservée à `lune`, `ceinture`, `anneaux` et `nebuleuse` (ouverture nulle ailleurs : image nette
    et 10 passes économisées) ; ouvertures maximales ramenées à 0,85 (un plan à mi-bascule restait illisible) ;
  - flou **prémultiplié par la carte de flou** et flou de **premier plan seul** étalé : un sujet net ne bave plus sur le
    fond flou (halo autour des roches), un premier plan flou déborde toujours sur le net ;
  - flare anamorphique : filtre de traînée de Kawase (décroissance exponentielle, sans conservation d'énergie) au lieu
    d'un flou gaussien, invisible sur une étoile de quelques pixels ; source masquée autour de l'étoile (le limbe
    éclairé d'une planète ne fait plus de traînée) ; traînée atténuée quand l'étoile est grande à l'écran ;
  - exposition : luminance sur deux octets (cibles 8 bits, sans extension flottante), demi-correction bornée à
    [0,85 ; 1,2], **réglée d'emblée à chaque plan** (pas d'iris visible sur une coupe), dérive lente dans le plan ;
  - CRT : **mise sous tension** (une ligne qui s'ouvre en 0,3 s) qui remplace le fondu d'ouverture du système, puis
    retour à l'image ;
  - `PH.update` (réglages sans rendu), `PH.wipe` (avant | après), `PH.forceCRT`, tables `__PHOTO.LOOKS` et `SHOT` ;
  - réalisateur (P2), plan `ceinture` : le premier plan de la bascule est la roche la plus proche **qui reste dans le
    champ** pendant la bascule ; sans elle, pas de bascule (un point sur une roche hors champ rendait tout le cadre flou).
- Coût : 17 à 27 passes par image, dont deux en pleine résolution (scène, composition) ; carte de flou et préparation à
  ½, le reste au ¼ ou moins.
- Test `tests/photo_test.py` : 15 contrôles verts — 3 systèmes en temps virtuel (looks sans répétition, CRT seulement
  aux ouvertures, ouvertures dans les bornes) ; sans effet, écart moyen de 0,17 niveau avec l'image du jeu ; noir
  complet entre deux systèmes ; bandes noires ; carte de flou du plan `lune` (2,8 % de pixels nets, la lune ; 97 % de
  flou marqué) ; luminance avec/sans effets de 0,76 à 1,24 ; planches `photo-planche.jpg` et `photo-looks.jpg`.
