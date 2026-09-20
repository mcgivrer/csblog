#!/usr/bin/env bash
# selftest.sh — test de non-régression de space-travel.html (Chrome headless,
# aucune dépendance à installer).
#
# Charge la page avec ?seed=…&selftest=1, récupère l'instantané écrit par le
# bloc AUTO-TEST du script (#selftest) et le compare à selftest.expected :
#   - les empreintes route, i18n et legs doivent être identiques ;
#   - si selftest.expected contient geomGrowthMax=N, la croissance du nombre
#     de géométries GPU pendant la sonde de fuite ne doit pas dépasser N ;
#   - le profil d'échelle par défaut (scale) est celui de la référence ;
#   - le profil « allegee » satisfait les six règles R1 à R6 de
#     docs/etude-echelles.md (« actuel » n'en satisfait aucune : constat de
#     l'étude, affiché à titre d'information).
#   - rendu des étoiles (docs/etude-rendu-etoiles.md) : le pool de lumières
#     ponctuelles a le nombre attendu (starLights) et il est constant, des
#     lumières sont en service près d'une étoile brillante, la passe de
#     lens-flare ajoute des pixels, l'occultation analytique masque une étoile
#     derrière une sphère, et le rendu ne laisse aucune erreur WebGL.
# Puis charge ?scale=allegee&selftest=1 : le profil se charge, génère le même
# nombre d'étapes et une route différente (la table SCALE pilote la génération).
# Puis charge ?starfx=0&selftest=1 : rendu d'origine des étoiles (aucune lumière
# ajoutée, aucune passe de flare) et route inchangée.
# Puis charge ?selftest=boot : le bouton START doit apparaître à la fin de la
# séquence de démarrage, et un clic doit lancer la musique (play() appelé dans
# le gestionnaire du clic) puis afficher l'écran-titre, dont les textes suivent
# la langue sélectionnée (focus, survol). Sans référence.
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

# run_page MODE BUDGET [PARAMS] : charge la page avec ?selftest=MODE (BUDGET =
# temps virtuel en ms, PARAMS = paramètres d'URL en plus, ex. « &scale=allegee »)
# et affiche le contenu de <pre id="selftest">
run_page() {
  "$CHROME" --headless=new --no-sandbox --disable-dev-shm-usage \
    --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --user-data-dir="$TMP/profile" --virtual-time-budget="$2" \
    --dump-dom "file://$HTML?seed=$SEED&selftest=$1${3:-}" >"$TMP/dom.html" 2>"$TMP/err.log" || true
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

field()        { printf '%s\n' "$1" | sed -n "s/^$2=//p" | head -1; }
actual_get()   { field "$ACTUAL" "$1"; }
expected_get() { grep -E "^$1=" "$EXPECTED" 2>/dev/null | head -1 | cut -d= -f2- || true; }

if [ "$UPDATE" = 1 ]; then
  {
    echo "# Références de selftest.sh (graine $SEED). Régénérées par : ./selftest.sh --update"
    for k in legs route i18n scale starLights; do echo "$k=$(actual_get $k)"; done
    grep -E '^geomGrowthMax=' "$EXPECTED" 2>/dev/null || true
  } > "$EXPECTED.new"
  mv "$EXPECTED.new" "$EXPECTED"
  echo "Références mises à jour : $EXPECTED"
  exit 0
fi

[ -f "$EXPECTED" ] || { echo "selftest.expected absent : lancer ./selftest.sh --update" >&2; exit 2; }

FAIL=0
for k in legs route i18n scale starLights; do
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

rules="$(actual_get rules.allegee)"
if [ "$rules" = "6" ]; then echo "OK    rules.allegee=6/6"; else echo "ÉCHEC rules.allegee=${rules:-absent}/6 : une règle R1 à R6 n'est plus satisfaite"; FAIL=1; fi
echo "INFO  rules.actuel=$(actual_get rules.actuel)/6 (constat de l'étude : aucune)"

# rendu des étoiles (docs/etude-rendu-etoiles.md) : lumières ponctuelles en service et de
# nombre constant, passe de lens-flare qui ajoute bien des pixels, occultation, pas d'erreur GL
check_eq() { local got; got="$(actual_get "$1")"; if [ "$got" = "$2" ]; then echo "OK    $1=$got"; else echo "ÉCHEC $1=${got:-absent} (attendu $2)"; FAIL=1; fi; }
check_ge() { local got; got="$(actual_get "$1")"; if [ -n "$got" ] && [ "$got" -ge "$2" ] 2>/dev/null; then echo "OK    $1=$got (min $2)"; else echo "ÉCHEC $1=${got:-absent} (min $2)"; FAIL=1; fi; }
echo "--- étoiles ---"
check_eq starfx 1
check_ge starLightsLit 1
check_eq pointLightsStable 1
check_ge flareActive 1
check_eq flarePixels 1
check_eq flareOcclusion 1
check_eq glError 0

ALLEGEE="$(run_page 1 20000 '&scale=allegee')"
if [ -z "$ALLEGEE" ]; then
  echo "Profil allegee : instantané introuvable, le script de la page a échoué. Journal Chrome :" >&2
  tail -20 "$TMP/err.log" >&2
  exit 2
fi
echo "--- profil allegee ---"
a_scale="$(field "$ALLEGEE" scale)"; a_legs="$(field "$ALLEGEE" legs)"; a_route="$(field "$ALLEGEE" route)"
if [ "$a_scale" = "allegee" ]; then echo "OK    scale=$a_scale"; else echo "ÉCHEC scale=${a_scale:-absent} (attendu allegee)"; FAIL=1; fi
if [ "$a_legs" = "$(expected_get legs)" ]; then echo "OK    legs=$a_legs"; else echo "ÉCHEC legs=${a_legs:-absent} (attendu $(expected_get legs))"; FAIL=1; fi
if [ -n "$a_route" ] && [ "$a_route" != "$(actual_get route)" ]; then echo "OK    route=$a_route (différente de actuel)"; else echo "ÉCHEC route=${a_route:-absent} : identique à actuel, la table SCALE ne pilote plus la génération"; FAIL=1; fi
echo "INFO  geomGrowth=$(field "$ALLEGEE" geomGrowth)"

CLASSIC="$(run_page 1 20000 '&starfx=0')"
if [ -z "$CLASSIC" ]; then
  echo "?starfx=0 : instantané introuvable, le script de la page a échoué. Journal Chrome :" >&2
  tail -20 "$TMP/err.log" >&2
  exit 2
fi
echo "--- ?starfx=0 (rendu d'origine des étoiles) ---"
c_fx="$(field "$CLASSIC" starfx)"; c_lights="$(field "$CLASSIC" starLights)"; c_route="$(field "$CLASSIC" route)"; c_flare="$(field "$CLASSIC" flareActive)"
if [ "$c_fx" = "0" ]; then echo "OK    starfx=0"; else echo "ÉCHEC starfx=${c_fx:-absent} (attendu 0)"; FAIL=1; fi
if [ "$c_lights" = "0" ]; then echo "OK    starLights=0 (aucune lumière ajoutée)"; else echo "ÉCHEC starLights=${c_lights:-absent} (attendu 0)"; FAIL=1; fi
if [ "$c_route" = "$(expected_get route)" ]; then echo "OK    route=$c_route (le rendu n'entre pas dans la génération)"; else echo "ÉCHEC route=${c_route:-absent} (attendu $(expected_get route))"; FAIL=1; fi
if [ -z "$c_flare" ]; then echo "OK    aucune passe de lens-flare"; else echo "ÉCHEC flareActive=$c_flare : passe de flare présente malgré ?starfx=0"; FAIL=1; fi

BOOT="$(run_page boot 5200)"
if [ -z "$BOOT" ]; then
  echo "Parcours de démarrage introuvable : le script de la page a échoué. Journal Chrome :" >&2
  tail -20 "$TMP/err.log" >&2
  exit 2
fi
echo "--- démarrage ---"
for kv in startHiddenAtFirst=1 startVisibleAfterLines=1 playCallsOnClick=1 titleShown=1 bootGone=1 titleActive=1 \
          titleFollowsFocus=1 hoverIgnoredWhenStill=1 hoverFollowsRealMove=1; do
  if printf '%s\n' "$BOOT" | grep -qx "$kv"; then
    echo "OK    $kv"
  else
    echo "ÉCHEC $kv (obtenu : $(printf '%s\n' "$BOOT" | grep "^${kv%%=*}=" || echo absent))"; FAIL=1
  fi
done
exit $FAIL
