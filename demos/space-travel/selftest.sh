#!/usr/bin/env bash
# selftest.sh — test de non-régression de space-travel.html (Chrome headless,
# aucune dépendance à installer).
#
# Charge la page avec ?seed=…&selftest=1, récupère l'instantané écrit par le
# bloc AUTO-TEST du script (#selftest) et le compare à selftest.expected :
#   - les empreintes route, i18n et legs doivent être identiques ;
#   - si selftest.expected contient geomGrowthMax=N, la croissance du nombre
#     de géométries GPU pendant la sonde de fuite ne doit pas dépasser N.
# Puis charge ?selftest=boot : le bouton START doit apparaître à la fin de la
# séquence de démarrage, et un clic doit lancer la musique (play() appelé dans
# le gestionnaire du clic) puis afficher l'écran-titre. Sans référence.
#
# Usage : ./selftest.sh [--update] [fichier.html]
#   --update  réécrit les empreintes de référence. À faire seulement après un
#             changement VOULU de la génération ou des textes.
# Variables : CHROME (chemin du navigateur), SEED (graine, défaut TEST).
#
# Les empreintes valent pour un même moteur JavaScript (mêmes Math.sin/pow) :
# les régénérer avec --update si le navigateur change de version majeure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE=0
if [ "${1:-}" = "--update" ]; then UPDATE=1; shift; fi
HTML="$(realpath "${1:-$HERE/space-travel.html}")"
EXPECTED="$HERE/selftest.expected"
SEED="${SEED:-TEST}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
[ -n "$CHROME" ] || { echo "Aucun Chrome/Chromium trouvé (variable CHROME)." >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# run_page MODE BUDGET : charge la page avec ?selftest=MODE (BUDGET = temps
# virtuel en ms) et affiche le contenu de <pre id="selftest">
run_page() {
  "$CHROME" --headless=new --no-sandbox --disable-dev-shm-usage \
    --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --user-data-dir="$TMP/profile" --virtual-time-budget="$2" \
    --dump-dom "file://$HTML?seed=$SEED&selftest=$1" >"$TMP/dom.html" 2>"$TMP/err.log" || true
  # le DOM est aplati sur une ligne avant d'extraire : dans la version minifiée,
  # tout le script tient sur une seule ligne, juste avant la balise <pre>
  tr '\n' '\r' < "$TMP/dom.html" | sed -n 's/.*<pre id="selftest">\([^<]*\)<\/pre>.*/\1/p' | tr '\r' '\n'
}

ACTUAL="$(run_page 1 20000)"
if [ -z "$ACTUAL" ]; then
  echo "Instantané introuvable : le script de la page a échoué. Journal Chrome :" >&2
  tail -20 "$TMP/err.log" >&2
  exit 2
fi
echo "$ACTUAL"
echo "---"

actual_get()   { printf '%s\n' "$ACTUAL" | sed -n "s/^$1=//p" | head -1; }
expected_get() { grep -E "^$1=" "$EXPECTED" 2>/dev/null | head -1 | cut -d= -f2- || true; }

if [ "$UPDATE" = 1 ]; then
  {
    echo "# Références de selftest.sh (graine $SEED). Régénérées par : ./selftest.sh --update"
    for k in legs route i18n; do echo "$k=$(actual_get $k)"; done
    grep -E '^geomGrowthMax=' "$EXPECTED" 2>/dev/null || true
  } > "$EXPECTED.new"
  mv "$EXPECTED.new" "$EXPECTED"
  echo "Références mises à jour : $EXPECTED"
  exit 0
fi

[ -f "$EXPECTED" ] || { echo "selftest.expected absent : lancer ./selftest.sh --update" >&2; exit 2; }

FAIL=0
for k in legs route i18n; do
  exp="$(expected_get $k)"; act="$(actual_get $k)"
  if [ "$exp" = "$act" ]; then echo "OK    $k=$act"; else echo "ÉCHEC $k : attendu $exp, obtenu $act"; FAIL=1; fi
done

max="$(expected_get geomGrowthMax)"; growth="$(actual_get geomGrowth)"
if [ -z "$max" ]; then
  echo "INFO  geomGrowth=$growth (seuil non défini)"
elif [ "$growth" -le "$max" ]; then
  echo "OK    geomGrowth=$growth (max $max)"
else
  echo "ÉCHEC geomGrowth=$growth > $max : fuite de géométries GPU"; FAIL=1
fi

BOOT="$(run_page boot 5200)"
if [ -z "$BOOT" ]; then
  echo "Parcours de démarrage introuvable : le script de la page a échoué. Journal Chrome :" >&2
  tail -20 "$TMP/err.log" >&2
  exit 2
fi
echo "--- démarrage ---"
for kv in startHiddenAtFirst=1 startVisibleAfterLines=1 playCallsOnClick=1 titleShown=1 bootGone=1 titleActive=1; do
  if printf '%s\n' "$BOOT" | grep -qx "$kv"; then
    echo "OK    $kv"
  else
    echo "ÉCHEC $kv (obtenu : $(printf '%s\n' "$BOOT" | grep "^${kv%%=*}=" || echo absent))"; FAIL=1
  fi
done
exit $FAIL
