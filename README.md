# csblog — blog et portfolio de McGivrer

Site statique personnel de Frédéric Delorme (McGivrer) : une page d'accueil en plusieurs variantes graphiques, et une série de démos interactives en HTML autonome (3D, raycasting ASCII, visualisation de données, simulateur spatial…).

Aucune installation : pas de gestionnaire de paquets, pas de compilation à la racine.

## Aperçu en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Pages d'accueil

| Fichier | Contenu |
|---|---|
| `index.html` | Page d'accueil courante |
| `index_2.html` | Variante alternative |
| `index-1998.html` | Variante rétro, style 1998 |
| `index-cyberspace.html` | Variante « cyberspace », présentée comme un flux |

## Démos

Chaque démo est un fichier HTML unique, sauf indication contraire. Les bibliothèques externes (Three.js, polices) sont chargées depuis un CDN au premier chargement.

| Démo | Contenu |
|---|---|
| `demos/3d-city.html` | Ville en vraie 3D façon GTA (Three.js) |
| `demos/ascii-city.html` | Ville façon GTA en raycasting ASCII haute définition |
| `demos/cyberdeck.html` | Interface « cyberdeck » (captures dans `demos/img/`) |
| `demos/oceans-data.html` | Circulation océanique : courants, température, vent (variantes `_2` et `_3`) |
| [`demos/space-travel/`](./demos/space-travel/README.md) | Simulateur de vol spatial procédural *Space Travel & Transport*, et démo cinématique *Observation des étoiles*. Seul projet doté d'un vrai build (voir son `CLAUDE.md`) |
| `demos/skill-charte-graphique-mcgivrer/` | Charte graphique McGivrer : guide HTML, Markdown, PDF, DOCX et gabarits |

## Structure

```
index*.html                  pages d'accueil
demos/                       démos autonomes
images/                      images des pages d'accueil
spec-space_travel_and_transport-2.6.md   ancienne spécification du simulateur spatial
```

La documentation à jour du simulateur spatial se trouve dans `demos/space-travel/docs/`.

## Auteur

© Frédéric Delorme — [McGivrer](https://github.com/mcgivrer)
