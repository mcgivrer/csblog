# Bibliothèques embarquées du viewer autonome

`build_viewer_standalone.py` lit ce dossier pour produire `chantier_naval_stt_autonome.html`. Ce fichier unique s'ouvre d'un double-clic, sans serveur ni réseau.

| Fichier | Contenu | Licence |
|---|---|---|
| `three-0.169.0-stt.min.js` | Three.js r169 et les modules utilisés par l'éditeur, en un script classique. Il définit `window.STT3` | MIT (`LICENSE-three.txt`) |
| `stt-fonts.css` | Barlow Condensed 600/700/800, IBM Plex Mono 400/500 et IBM Plex Sans 400/500/600, sous-ensembles latin et latin-ext, en `@font-face` base64 | SIL OFL 1.1 (`OFL-Barlow.txt`, `OFL-IBM-Plex.txt`) |
| `three-entry.js` | Point d'entrée du bundle Three.js | |

## Ajouter un module Three.js à l'éditeur

Le build échoue si l'éditeur importe un nom absent du bundle. Le message d'erreur donne ce nom. Pour l'ajouter :

1. Ajoute l'import et le nom dans `window.STT3` de `three-entry.js`.
2. Mets à jour la liste dans la bannière (`--banner`, ci-dessous). Le build lit cette liste.
3. Reconstruis le bundle (Node requis) :

```bash
npm i esbuild@0.24 three@0.169.0
npx esbuild three-entry.js --bundle --minify --format=iife --target=es2020 --legal-comments=none \
  --banner:js="/* three.js r169 (MIT, three.js authors) + examples/jsm addons — bundle STT pour l'éditeur Chantier naval hors ligne. Exporte window.STT3 = { THREE, GLTFLoader, OrbitControls, RoomEnvironment, mergeGeometries, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, GTAOPass } */" \
  --outfile=three-0.169.0-stt.min.js
```

Si l'éditeur passe à une autre version de Three.js, renomme le fichier en conséquence. Le build prend le plus récent `three-*-stt.min.js` du dossier.
