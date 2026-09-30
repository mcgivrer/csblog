"""
Spécification Markdown → PDF (A4) : HTML imprimable, ancres identiques au sommaire, diagrammes Mermaid rendus,
pied de page numéroté. Usage : python3 spec_pdf.py entree.md sortie.pdf "Titre du pied de page"
"""
import re, sys, os, html
import markdown
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
src, dst, footer = sys.argv[1], sys.argv[2], sys.argv[3]
MERMAID = '/home/claude/st216/node_modules/mermaid/dist/mermaid.min.js'

def slug(value, separator='-'):
    x = value.strip().lower(); x = re.sub(r"[^\w\s-]", "", x, flags=re.UNICODE); return re.sub(r"\s", "-", x)

md = open(src, encoding='utf-8').read()
body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'sane_lists', 'toc'],
                         extension_configs={'toc': {'slugify': slug, 'permalink': False}})
body = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>', lambda m: '<pre class="mermaid">' + m.group(1) + '</pre>', body, flags=re.S)
CSS = """
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
body { font-family: 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif; font-size: 10pt; line-height: 1.45; color: #1b2230; }
h1 { font-size: 20pt; color: #0b1220; border-bottom: 2px solid #d9822b; padding-bottom: 4px; margin-top: 0; page-break-before: always; }
h1:first-of-type { page-break-before: avoid; }
h2 { font-size: 14pt; color: #0f1a30; border-left: 4px solid #d9822b; padding-left: 8px; margin-top: 22px; page-break-after: avoid; }
h3 { font-size: 11.5pt; color: #25375c; page-break-after: avoid; }
a { color: #1f5fa8; text-decoration: none; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 8.8pt; page-break-inside: avoid; }
th, td { border: 1px solid #c3cad6; padding: 4px 6px; vertical-align: top; }
th { background: #eef1f6; }
img { max-width: 100%; height: auto; page-break-inside: avoid; display: block; margin: 6px auto; }
td img { margin: 0; }
blockquote { margin: 8px 0; padding: 6px 10px; background: #fff6ea; border-left: 4px solid #d9822b; color: #3a2a10; page-break-inside: avoid; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.6pt; background: #f1f3f7; padding: 0 3px; }
pre { background: #f1f3f7; padding: 8px; font-size: 8pt; white-space: pre-wrap; page-break-inside: avoid; }
pre.mermaid { background: #fff; text-align: center; page-break-inside: avoid; }
hr { border: none; border-top: 1px solid #c3cad6; margin: 14px 0; }
"""
tmp = os.path.abspath(dst) + '.html'
open(tmp, 'w', encoding='utf-8').write(f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>")
with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page()
    pg.goto('file://' + tmp, timeout=180000, wait_until='load')
    pg.add_script_tag(path=MERMAID)
    n = pg.evaluate("""async () => { mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { useMaxWidth: true } });
      const els = [...document.querySelectorAll('pre.mermaid')]; await mermaid.run({ nodes: els }); return els.filter(e => e.querySelector('svg')).length; }""")
    pg.evaluate("() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))")
    pg.pdf(path=dst, format='A4', print_background=True, display_header_footer=True,
           header_template='<div></div>',
           footer_template=f"<div style='font-size:7.5pt;color:#5d6f92;width:100%;text-align:center;font-family:sans-serif'>{html.escape(footer)} · <span class='pageNumber'></span> / <span class='totalPages'></span></div>",
           margin={'top': '16mm', 'bottom': '18mm', 'left': '14mm', 'right': '14mm'})
    br.close()
os.remove(tmp)
print(f"{os.path.basename(dst)} : {os.path.getsize(dst)//1024} Ko · diagrammes rendus {n}")
