#!/usr/bin/env bash
# screenshots.sh — refait les captures d'écran de la documentation
# (Chrome headless, aucune dépendance à installer ; ImageMagick pour la
# conversion et le recadrage).
#
# Pour chaque scène, une copie temporaire de space-travel.html reçoit le pilote
# screenshots.js (le jeu lui-même n'est pas modifié), Chrome charge
# ?seed=…&shot=NOM&lang=…, le pilote met le jeu dans l'état voulu en rejouant
# le temps à la main, et Chrome enregistre la page. Les scènes marquées
# « recadrage » sont découpées autour des éléments désignés par le pilote.
#
# Usage : ./screenshots.sh [options] [scène …]
#   --lang fr|en|de|es|all   langue du jeu (défaut : fr et en)
#   --out DIR                dossier de sortie (défaut : screenshots/, un
#                            sous-dossier par langue)
#   --html FICHIER           page à photographier (défaut : space-travel.html)
#   --list                   liste les scènes et quitte (celles dont le nom commence
#                            par _ sont des outils, faites seulement sur demande)
#   --keep                   garde les pages et images intermédiaires (débogage)
# Variables : CHROME (navigateur), SEED (graine, défaut SHOTS), BUDGET (temps
# virtuel par scène en ms, défaut 40000), JOBS (scènes en parallèle, défaut 2),
# URLX (paramètres d'URL ajoutés pour le réglage d'une scène, ex. « &seq=face »),
# QUALITY (qualité JPEG, défaut 80 : texte net et images légères, les captures
# étant embarquées en base64 dans les spécifications).
# Option --debug : affiche le journal (#shot-debug) et les erreurs du pilote.
#
# Les captures dépendent de la page (mise en page du HUD, rendu des étoiles) :
# à refaire après toute évolution visible, avec la même graine.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML="$HERE/space-travel.html"
OUT="$HERE/screenshots"
LANGS="fr en"
KEEP=0
DEBUG=0
SEED="${SEED:-SHOTS}"
BUDGET="${BUDGET:-40000}"
JOBS="${JOBS:-2}"
JPEG=(-quality "${QUALITY:-80}" -sampling-factor 4:2:0 -strip -interlace Plane)
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"

# nom  largeur x hauteur  échelle  tactile(0/1)  recadrage(0/1)  [graine propre à la scène]
SCENES=(
  "boot       1280x800   1  0  0"
  "title      1280x800   1  0  0"
  "cruise     1280x800   1  0  0"
  "nebula     1280x800   1  0  0"
  "hull       1280x800   1  0  0"
  "flightplan 1280x800   2  0  1"
  "gates      1280x800   1  0  0"
  "system     1280x800   1  0  0  ALPHA"     # première étape : ceinture, anneaux et lunes
  "approach   1280x800   1  0  0"
  "orbit      1280x800   1  0  0"
  "stack      1280x1000  2  0  1"
  "radio      1280x800   1  0  0"
  "gauges     1280x800   2  0  1"
  "pause      1280x800   1  0  0"
  "help       1280x800   1  0  0"
  "itinerary  1280x800   1  0  0"
  "volume     1280x800   1  0  0"
  "map        1280x800   1  0  0"
  "phone       430x932   2  1  0"     # 430 px : la barre de 14 icônes tient (elle déborde sous ~420 px)
  "tablet     1024x768   1.5  1  0"
  "_probe      640x400   1  0  0"
)

WANTED=()
while [ $# -gt 0 ]; do
  case "$1" in
    --lang)  LANGS="$2"; [ "$2" = all ] && LANGS="fr en de es"; shift 2 ;;
    --out)   OUT="$(realpath -m "$2")"; shift 2 ;;
    --html)  HTML="$(realpath "$2")"; shift 2 ;;
    --keep)  KEEP=1; shift ;;
    --debug) DEBUG=1; shift ;;
    --list)  printf '%s\n' "${SCENES[@]}" | awk '{print $1}'; exit 0 ;;
    -*)      echo "Option inconnue : $1" >&2; exit 2 ;;
    *)       WANTED+=("$1"); shift ;;
  esac
done
[ -n "$CHROME" ] || { echo "Aucun Chrome/Chromium trouvé (variable CHROME)." >&2; exit 2; }
command -v convert >/dev/null || { echo "ImageMagick (convert) est requis." >&2; exit 2; }

TMP="$(mktemp -d)"
[ "$KEEP" = 1 ] || trap 'rm -rf "$TMP"' EXIT
echo "Dossier de travail : $TMP" >&2

# page_for TACTILE SORTIE : copie de la page avec le pilote injecté ; en mode
# tactile, matchMedia('(pointer: coarse)') répond oui (le jeu ne teste ce
# critère qu'au chargement)
page_for() {
  python3 - "$HTML" "$HERE/screenshots.js" "$1" "$2" <<'PY'
import sys
src, drv, touch, dst = sys.argv[1:5]
html = open(src, encoding='utf-8').read()
driver = open(drv, encoding='utf-8').read()
head = ''
if touch == '1':
    head = ("<script>(function(){var m=window.matchMedia.bind(window);"
            "window.matchMedia=function(q){var r=m(q);if(/pointer:\\s*coarse/.test(q))"
            "return {matches:true,media:q,addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){}};"
            "return r;};})();</script>\n")
i = html.index('</head>')
html = html[:i] + head + html[i:]
j = html.rindex('</body>')
html = html[:j] + '<script>\n' + driver + '\n</script>\n' + html[j:]
open(dst, 'w', encoding='utf-8').write(html)
PY
}

# shoot NOM LANGUE : une scène dans une langue
shoot() {
  local name="$1" lang="$2" size="$3" dpr="$4" touch="$5" cropped="$6"
  local w="${size%x*}" h="${size#*x}" seed="${7:-$SEED}"
  local tag="$name-$lang"
  local page="$TMP/$tag.html" png="$TMP/$tag.png" dom="$TMP/$tag.dom"
  page_for "$touch" "$page"
  local url="file://$page?seed=$seed&shot=$name&lang=$lang${URLX:-}"
  local common=(--headless=new --no-sandbox --disable-dev-shm-usage --use-angle=swiftshader
    --enable-unsafe-swiftshader --ignore-gpu-blocklist --hide-scrollbars
    --force-device-scale-factor="$dpr"
    --user-data-dir="$TMP/profile-$tag" --virtual-time-budget="$BUDGET")
  mkdir -p "$OUT/$lang"
  local rect=""
  if [ "$cropped" = 1 ]; then
    # --dump-dom ne dispose que de la fenêtre moins sa barre (143 px avec
    # Chrome 153), alors que --screenshot rend la fenêtre entière : on agrandit
    # la fenêtre de mesure de cet écart, vérifié via la hauteur publiée par le
    # pilote (5e valeur du rectangle), et corrigé une fois si besoin
    local hh=$((h + ${CHROME_BAR:-143})) attempt ih
    for attempt in 1 2; do
      "$CHROME" "${common[@]}" --window-size="$w,$hh" --dump-dom "$url" >"$dom" 2>"$TMP/$tag.err" || true
      rect="$(tr '\n' '\r' <"$dom" | sed -n 's/.*<pre id="shot-rect"[^>]*>\([^<]*\)<\/pre>.*/\1/p' | tr '\r' '\n')"
      ih="${rect##*,}"
      [ "$ih" = "$h" ] && break
      [ -n "$ih" ] || break
      hh=$((hh + h - ih))
    done
  fi
  "$CHROME" "${common[@]}" --window-size="$w,$h" --screenshot="$png" "$url" >/dev/null 2>"$TMP/$tag.err" || true
  if [ ! -s "$png" ]; then
    echo "ÉCHEC $tag : pas de capture. Journal Chrome :" >&2; tail -5 "$TMP/$tag.err" >&2; return 1
  fi
  if [ "$cropped" = 1 ]; then
    [ -n "$rect" ] || { echo "ÉCHEC $tag : rectangle de recadrage introuvable" >&2; return 1; }
    [ "$DEBUG" = 1 ] && echo "DEBUG $tag : rectangle de recadrage $rect (px CSS)" >&2
    IFS=, read -r rx ry rw rh _ <<<"$rect"
    local s; s="$(awk -v d="$dpr" 'BEGIN{print d}')"
    convert "$png" -crop "$(awk -v x="$rx" -v y="$ry" -v w="$rw" -v h="$rh" -v d="$s" 'BEGIN{printf "%dx%d+%d+%d", w*d, h*d, x*d, y*d}')" +repage "${JPEG[@]}" "$OUT/$lang/$name.jpg"
  else
    convert "$png" "${JPEG[@]}" "$OUT/$lang/$name.jpg"
  fi
  # --debug : relit le DOM pour afficher le journal (#shot-debug) et une
  # éventuelle erreur (#shot-error) du pilote
  if [ "$DEBUG" = 1 ]; then
    "$CHROME" "${common[@]}" --window-size="$w,$((h + ${CHROME_BAR:-143}))" --dump-dom "$url" >"$dom" 2>/dev/null || true
    tr '\n' '\r' <"$dom" | sed -n 's/.*<pre id="shot-debug"[^>]*>\([^<]*\)<\/pre>.*/\1/p' | tr '\r' '\n' | sed "s/^/DEBUG $tag : /"
    tr '\n' '\r' <"$dom" | sed -n 's/.*<pre id="shot-error">\([^<]*\)<\/pre>.*/\1/p' | tr '\r' '\n' | sed "s/^/ERREUR $tag : /"
  fi
  echo "OK    $lang/$name.jpg ($(identify -format '%wx%h' "$OUT/$lang/$name.jpg"))"
}

RUN=()
for spec in "${SCENES[@]}"; do
  read -r name size dpr touch cropped seed _ <<<"$spec"
  if [ ${#WANTED[@]} -gt 0 ]; then
    hit=0; for w in "${WANTED[@]}"; do [ "$w" = "$name" ] && hit=1; done
    [ "$hit" = 1 ] || continue
  else
    case "$name" in _*) continue ;; esac   # scènes d'outillage : seulement sur demande
  fi
  for lang in $LANGS; do RUN+=("$name|$lang|$size|$dpr|$touch|$cropped|${seed:-$SEED}"); done
done
[ ${#RUN[@]} -gt 0 ] || { echo "Aucune scène à faire (voir --list)." >&2; exit 2; }

FAIL=0
running=0
for job in "${RUN[@]}"; do
  IFS='|' read -r name lang size dpr touch cropped seed <<<"$job"
  shoot "$name" "$lang" "$size" "$dpr" "$touch" "$cropped" "$seed" &
  running=$((running+1))
  if [ "$running" -ge "$JOBS" ]; then wait -n || FAIL=1; running=$((running-1)); fi
done
while [ "$running" -gt 0 ]; do wait -n || FAIL=1; running=$((running-1)); done
exit $FAIL
