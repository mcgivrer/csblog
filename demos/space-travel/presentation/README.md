# Voyage Spatial — présentation à fond cinématique

Lecteur de slides HTML dont le fond est une cinématique **temps réel** du moteur du jeu, limitée au décor :
espace, étoiles, nébuleuses, planètes, lunes, anneaux, astéroïdes, systèmes. Aucun vaisseau, station, port ni navette.

Le moteur allégé est le module partagé [`../shared/cosmos.js`](../shared/cosmos.js) : même graine, mêmes systèmes que le jeu.

## État

| Lot | Contenu | État |
|---|---|---|
| P1 | moteur allégé `shared/cosmos.js` + visionneuse de test | ✅ |
| P2 | réalisateur céleste (plans sans vaisseau, grammaire de cinéma) | à venir |
| P3 | direction photo « Cinéma » (bloom HDR, profondeur de champ, focale, flare anamorphique, grain, 2.39…) | à venir |
| P4 | lecteur de slides, export de clip webm, qualité automatique | à venir |
| P5 | finition, publication | à venir |

Spécification du lot en cours : [`docs/SPEC-P1-cosmos.md`](docs/SPEC-P1-cosmos.md).

## Construire et tester

```bash
cd demos/space-travel/presentation
python3 build/build.py            # compile puis test
python3 build/build.py compile    # -> dist/cosmos-test.html
python3 build/build.py test       # Playwright + Chromium ; parité avec ../sources/target/space-travel.html si présent
```

Seul Python 3 est nécessaire pour compiler (three r128 est lu dans `../sources/src/JS/vendor/`). Les captures du test
vont dans `dist/shots/` (non suivi).

## Visionneuse de test

`dist/cosmos-test.html` s'ouvre directement dans le navigateur. Paramètres : `?seed=XXX` (graine, la même que dans le jeu),
`?density=0.5` (fond d'étoiles allégé), `?quality=fixed` (résolution figée).

| Touche | Action |
|---|---|
| `0` | l'étoile |
| `1` à `3` | les planètes |
| `L` | lune suivante de la planète visée |
| `A` | amas d'astéroïdes de la ceinture (ou entre deux orbites) |
| `N` / `P` | système suivant / précédent (les 6 plus spectaculaires du voisinage) |
| glisser · molette | orbiter · distance |
| `F` | focale suivante (24 → 135°) |
| `H` | masquer les informations |
