"""
Assemble la spécification v2.17-P1 à partir de la v2.16 :
- titre et en-tête, ligne d'historique, sommaire complété (Partie III) ;
- encadré « v2.17 » en tête de chaque chapitre touché ;
- Partie III (nouveaux chapitres) ajoutée, images `![..](file:chemin)` intégrées en base64.
Usage : python3 build_spec.py fr|en
"""
import re, sys, base64, io, os, json
ROOT = '/home/claude/st216'
HERE = os.path.dirname(os.path.abspath(__file__))
lang = sys.argv[1] if len(sys.argv) > 1 else 'fr'
T = json.load(open(os.path.join(HERE, f'textes_{lang}.json'), encoding='utf-8'))
base = open(T['base'], encoding='utf-8').read()
part3 = open(os.path.join(HERE, f'partie3_{lang}.md'), encoding='utf-8').read()

def slug(h):
    s = h.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    return re.sub(r"\s", "-", s)

def embed(md):
    from PIL import Image
    missing = []
    def rep(m):
        alt, rel = m.group(1), m.group(2); p = os.path.join(ROOT, rel)
        if not os.path.exists(p): missing.append(rel); return m.group(0)
        data = open(p, 'rb').read(); mime = 'image/jpeg'
        if p.endswith('.svg'): mime = 'image/svg+xml'
        elif p.endswith('.png'):
            if len(data) > 400_000:   # captures volumineuses : JPEG
                im = Image.open(io.BytesIO(data)).convert('RGB'); b = io.BytesIO(); im.save(b, 'JPEG', quality=85); data = b.getvalue()
            else: mime = 'image/png'
        return f"![{alt}](data:{mime};base64,{base64.b64encode(data).decode()})"
    out = re.sub(r"!\[([^\]]*)\]\(file:([^)]+)\)", rep, md)
    return out, missing

s = base
# 1) titre et en-tête
s = s.replace(T['title_old'], T['title_new'], 1)
first_para = s.index(T['header_anchor'])
s = s[:first_para] + T['header_new'] + '\n\n' + s[first_para:]
# 2) historique : nouvelle ligne après l'en-tête du tableau
hdr = T['history_header']
i = s.index(hdr); k = s.index('\n\n', i)
s = s[:k] + '\n' + T['history_row'] + s[k:]
# 3) encadrés par chapitre (après la ligne de titre « ## N. … »)
done = []
for num, text in T['callouts'].items():
    m = re.search(r"^## " + re.escape(num) + r"\. [^\n]*\n", s, flags=re.M)
    if not m: print('chapitre introuvable :', num); continue
    s = s[:m.end()] + '\n> ' + text.replace('\n', '\n> ') + '\n' + s[m.end():]; done.append(num)
# 4) sommaire : Partie III
heads = re.findall(r"^## (\d+\. [^\n]+)$", part3, flags=re.M)
toc = '\n\n**' + T['part3_title'] + '**\n' + '\n'.join(f"- [{h}](#{slug(h)})" for h in heads)
anchor = T['toc_last_line']; j = s.index(anchor) + len(anchor)
s = s[:j] + toc + s[j:]
# 5) Partie III en fin de document
s = s.rstrip() + '\n\n---\n\n' + part3
# 6) liens du sommaire : alignés sur les ancres réelles (la v2.16 écrivait « -- » là où l'ancre a « --- »)
heads_all = {slug(h) for h in re.findall(r"^#{1,3} (.+)$", s, flags=re.M)}
collapse = lambda x: re.sub(r"-{2,}", "-", x)
by_c = {collapse(h): h for h in heads_all}
fixed = 0
def fix(m):
    global fixed
    t = m.group(1)
    if t in heads_all: return m.group(0)
    if collapse(t) in by_c: fixed += 1; return '](#' + by_c[collapse(t)] + ')'
    return m.group(0)
s = re.sub(r"\]\(#([^)]+)\)", fix, s)
print('liens du sommaire corrigés :', fixed)
s, missing = embed(s)
out = os.path.join(ROOT, 'src/docs', T['out'])
open(out, 'w', encoding='utf-8').write(s)
print(f"{T['out']} : {len(s)//1024} Ko · encadrés {len(done)}/{len(T['callouts'])} · chapitres ajoutés {len(heads)} · images manquantes {missing}")
