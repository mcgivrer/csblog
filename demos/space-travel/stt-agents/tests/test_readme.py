"""Garde-fou du README de stt-agents (T3.10) : ce qu'il cite doit exister dans le code.

Trois contrôles, sur les zones « code » du README (blocs ```, fragments `…` et lignes de tableau) :
  (a) toute option `--xxx` existe dans l'argparse du serveur ou du client, ou fait partie de la
      liste EXTERNES (options de la commande `claude`, elles-mêmes vérifiées dans stt_runner.py) ;
  (b) toute route `/api/...` est connue du serveur. Motif documenté : les segments variables
      `<...>` sont ignorés ; le préfixe statique (jusqu'au premier `<`) doit figurer tel quel dans
      stt_agents_server.py, et chaque segment statique suivant (`report`, `tty`, `edit`, `pause`…)
      doit y figurer comme chaîne (`"/report"`, `"report"`…), ce qui couvre `path.endswith("/report")`
      et le tuple RUN_ACTIONS ;
  (c) tout fichier `.py`, `.html`, `.json` ou `.md` cité seul entre accents graves existe, chemin
      relatif au dossier stt-agents/ (donc `../docs/…` pour le reste du dépôt). Sont ignorés les
      chemins avec un joker (`<`, `*`, `{`), les fichiers d'exécution sous `.claude/` (absents du
      dépôt) et les noms d'exemple de EXEMPLES.

Lancer : python3 -m unittest discover -s demos/space-travel/stt-agents/tests -p test_readme.py -t demos/space-travel/stt-agents
"""

import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
STT = HERE.parent
REPO = STT.parents[2]
README = STT / 'README.md'
SERVER = STT / 'stt_agents_server.py'
CLIENT = STT / 'stt_client.py'
RUNNER = STT / 'stt_runner.py'

# Options de la commande `claude` (pas de l'argparse) ; chacune doit figurer dans stt_runner.py.
EXTERNES = {'--resume', '--settings', '--add-dir', '--permission-mode', '--session-id'}
# Noms de fichiers donnés en exemple dans les commandes, qui n'existent pas dans le dépôt.
EXEMPLES = {'ops.json', 'OPS.json', 'FICHIER.json', 'p.md'}

OPT_RE = re.compile(r'(?<![\w-])(--[a-z][a-z0-9-]*)')
ADD_ARG_RE = re.compile(r'add_argument\(\s*["\'](--[a-z][a-z0-9-]*)["\']')
FENCE_RE = re.compile(r'^```[^\n]*\n(.*?)^```', re.S | re.M)
SPAN_RE = re.compile(r'`([^`\n]+)`')
ROUTE_RE = re.compile(r'/api/[^\s`|)\]]*')
FILE_RE = re.compile(r'\.(py|html|json|md)$')


def zones(text):
    """Texte des zones code : blocs, fragments en ligne, lignes de tableau."""
    fences = FENCE_RE.findall(text)
    rest = FENCE_RE.sub('', text)
    spans = SPAN_RE.findall(rest)
    tables = [ln for ln in rest.splitlines() if ln.lstrip().startswith('|')]
    return fences, spans, tables


def known_options():
    out = set()
    for f in (SERVER, CLIENT):
        out |= set(ADD_ARG_RE.findall(f.read_text(encoding='utf-8')))
    return out


def check_options(text):
    fences, spans, tables = zones(text)
    cited = set()
    for chunk in fences + spans + tables:
        cited |= set(OPT_RE.findall(chunk))
    known = known_options()
    runner_src = RUNNER.read_text(encoding='utf-8')
    bad = []
    for opt in sorted(cited):
        if opt in known:
            continue
        if opt in EXTERNES and opt in runner_src:
            continue
        bad.append('option inconnue : ' + opt)
    return bad, cited


def route_ok(route, src):
    segs = route.split('/')[1:]
    static = []
    for s in segs:
        if '<' in s:
            break
        static.append(s)
    prefix = '/' + '/'.join(static)
    if prefix.rstrip('/') not in src:
        return False
    for s in segs[len(static):]:
        if '<' in s or not s:
            continue
        if ('"/' + s + '"') not in src and ('"' + s + '"') not in src:
            return False
    return True


def check_routes(text):
    fences, spans, tables = zones(text)
    cited = set()
    for chunk in fences + spans + tables:
        for r in ROUTE_RE.findall(chunk):
            r = r.split('?', 1)[0].rstrip('.,;:')
            if r.rstrip('/') != '/api':
                cited.add(r)
    src = SERVER.read_text(encoding='utf-8')
    return ['route inconnue : ' + r for r in sorted(cited) if not route_ok(r, src)], cited


def check_files(text):
    fences, spans, _ = zones(text)
    bad, cited = [], set()
    for sp in spans:
        sp = sp.strip()
        if ' ' in sp or not FILE_RE.search(sp) or any(c in sp for c in '<*{$'):
            continue
        if sp.startswith('.claude/') or sp in EXEMPLES:
            continue
        cited.add(sp)
        if not (STT / sp).exists():
            bad.append('fichier introuvable : ' + sp)
    for blk in fences:   # commandes complètes : chemins depuis la racine du dépôt
        for m in re.finditer(r'(?<![\w/.-])(demos/space-travel/[\w./-]+\.(?:py|html|json|md))', blk):
            cited.add(m.group(1))
            if not (REPO / m.group(1)).exists():
                bad.append('fichier introuvable : ' + m.group(1))
    return bad, cited


class ReadmeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = README.read_text(encoding='utf-8')

    def test_options_citees_existent(self):
        bad, cited = check_options(self.text)
        self.assertGreaterEqual(len(cited), 20, 'le README devrait citer les options du serveur et du client')
        self.assertEqual(bad, [])

    def test_routes_citees_existent(self):
        bad, cited = check_routes(self.text)
        self.assertGreaterEqual(len(cited), 10, 'le README devrait citer les routes de l\'API')
        self.assertEqual(bad, [])

    def test_fichiers_cites_existent(self):
        bad, cited = check_files(self.text)
        self.assertGreaterEqual(len(cited), 8, 'le README devrait citer les fichiers de l\'outil')
        self.assertEqual(bad, [])

    def test_toutes_les_options_du_serveur_sont_documentees(self):
        """Réciproque (hors options cachées de test) : une option ajoutée à l'argparse doit entrer au README."""
        src = SERVER.read_text(encoding='utf-8')
        hidden = set(re.findall(r'add_argument\(\s*["\'](--[a-z-]+)["\'][^\n]*argparse\.SUPPRESS', src))
        documented = set(OPT_RE.findall(self.text))
        toutes = set(ADD_ARG_RE.findall(src)) | set(ADD_ARG_RE.findall(CLIENT.read_text(encoding='utf-8')))
        self.assertEqual(sorted(o for o in toutes - documented if o not in hidden), [])

    def test_une_option_inventee_est_detectee(self):
        self.assertEqual(check_options(self.text)[0], [])
        bad, _ = check_options(self.text + '\n```bash\npython3 stt_agents_server.py --option-inventee\n```\n')
        self.assertIn('option inconnue : --option-inventee', bad)
        bad, _ = check_options(self.text + '\n| `--autre-invention` | | effet |\n')
        self.assertIn('option inconnue : --autre-invention', bad)
        bad, _ = check_options(self.text + '\nUne option `--inventee-en-ligne` dans une phrase.\n')
        self.assertIn('option inconnue : --inventee-en-ligne', bad)

    def test_une_route_ou_un_fichier_invente_est_detecte(self):
        bad, _ = check_routes(self.text + '\n`/api/inventee/<id>/report`\n')
        self.assertIn('route inconnue : /api/inventee/<id>/report', bad)
        bad, _ = check_routes(self.text + '\n`/api/runner/<tâche>/inventee`\n')
        self.assertIn('route inconnue : /api/runner/<tâche>/inventee', bad)
        bad, _ = check_files(self.text + '\n`stt_inventee.py`\n')
        self.assertIn('fichier introuvable : stt_inventee.py', bad)


if __name__ == '__main__':
    unittest.main()
