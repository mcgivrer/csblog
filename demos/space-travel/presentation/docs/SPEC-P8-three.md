# Présentation « Voyage Spatial » — lot P8 : three.js r186

## 1. Brief (chef de projet)

**Demande de l'auteur (07/10/2026).** « Upgrader three.js dans sa dernière version dans la présentation. »

**Périmètre.** La présentation seulement : elle passe de three r128 à **r186** (0.186.1, dernière version publiée sur
npm). Le jeu et la démo « Observation des étoiles » gardent r128 ; les modules partagés (`planets.js`, `asteroids.js`,
`stars.js`) doivent donc fonctionner avec les deux.

**Critères d'acceptation.**

1. Même image qu'avec r128, à l'œil : mêmes couleurs, même exposition, mêmes lumières sur les lunes et les astéroïdes.
2. Une page toujours autonome (un seul fichier HTML, sans module ES ni réseau), pas plus lourde.
3. Toutes les suites de tests vertes (fond, réalisateur, direction photo, lecteur lisible et compact).

## 2. Spécification technique (architecte)

**Empaquetage.** Depuis r160, three n'existe plus qu'en modules ES (`three.module.js` + `three.core.js`) ; la
présentation est faite de scripts classiques qui partagent `window.THREE`. `build/three_vendor.py` télécharge la
version demandée (npm), relève les symboles `THREE.X` réellement utilisés par les modules de la page (55), et les réunit
avec esbuild en un script `iife` qui définit `THREE` : `vendor/three.min.js`, **537 Ko** (three r128 complet : 589 Ko),
licence MIT conservée. `build.py compile` vérifie à chaque compilation que chaque `THREE.X` utilisé figure dans ce
sous-ensemble (sinon : relancer `three_vendor.py`).

| Changement de three | Traitement |
|---|---|
| `WebGLMultisampleRenderTarget` supprimé (r138) | `WebGLRenderTarget({ samples: 4 })` (`photo.js`) |
| `outputEncoding`, `sRGBEncoding`, `texture.encoding` supprimés (r152–r162) | `outputColorSpace = SRGBColorSpace` (lecteur, pages de test) |
| gestion des couleurs active par défaut (r152) : les couleurs hexadécimales et HSL passent en linéaire | `ColorManagement.enabled = false` (`three-compat.js`) : couleurs prises telles quelles, comme en r128 |
| ACES et sRGB appliqués seulement à l'écran, plus dans une cible de rendu (r153) | la direction photo rend la scène dans une cible : `three-compat.js` remplace les fragments `tonemapping_fragment` (ACES, exposition 1,15) et `colorspace_fragment` (sRGB) pour les matériaux de three |
| éclairage « historique » supprimé (r155, r165) : l'éclairement n'est plus multiplié par π | intensités × π (`W.lightK` dans `cosmos.js`, contre-éclairage du réalisateur) |
| WebGL 1 abandonné (r163) | shaders GLSL 1 des `ShaderMaterial` convertis par three, sans changement ; sans WebGL 2, la page passe au repli sans fond animé (lot P5) |

`src/three-compat.js` est chargé avant tous les autres modules ; les modules partagés n'ont pas changé.

## 3. Revue (architecte) et vérification (développeur) — 07/10/2026

- Parité r128 / r186 : les 21 slides filmées avec les mêmes graines (`COSMOS-TEST`, `RZ-TEST`), image par image :
  écart moyen ≤ 0,2 niveau sur 19 slides (dont la ceinture d'astéroïdes et la lune, matériaux de three), ≈ 1 niveau
  sur 2 slides (voile des nébuleuses), aucune différence visible.
- Tests verts sur r186 : `cosmos_test`, `realisateur_test`, `photo_test` (12 ambiances), `lecteur_test` sur les deux
  versions (repli sans WebGL, export de clip, qualité automatique compris) ; sonde de stabilité du disque des étoiles :
  sans à-coup.
- Poids : `presentation.min.html` 1 857 Ko (1 907 Ko avec r128).
