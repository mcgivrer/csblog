"""Tests de l'interface des notices (T2.2) : toasts, réglages par catégorie, thème clair (Playwright)."""

import http.client
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import helpers

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False

ROOT = Path(__file__).resolve().parents[4]
SHOTS = Path(tempfile.gettempdir()) / 'stt-t22-shots'


def raw(port, method, path, headers=None, body=None):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read().decode('utf-8', errors='replace')
    c.close()
    return r.status, data


def notice(i, sev='info', cat='agents', title='Titre', body='Corps du message', target=None):
    return {'id': i, 'ts': '2026-10-07T10:42:00Z', 'kind': 'test', 'cat': cat, 'severity': sev,
            'title': title, 'body': body, 'target': target or {'type': 'agent', 'id': 'x'}, 'key': f'k{i}'}


def lum(rgb):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class UiNotices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        src = ROOT / 'demos/space-travel/docs/work_in_progress/plan-status.js'
        cls.kb = helpers.copy_plan_status(str(src))
        cls.cm = helpers.test_server(str(ROOT), kanban_path=cls.kb)
        cls.srv = cls.cm.__enter__()
        cls.port = cls.srv['port']
        cls.url = cls.srv['url']
        helpers.wait_for_condition(lambda: 'notices' in json.loads(raw(cls.port, 'GET', '/api/state')[1]), timeout=10)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        SHOTS.mkdir(exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.cm.__exit__(None, None, None)

    def open(self, qs='?debug=1', theme=None):
        ctx = self.browser.new_context(viewport={'width': 1100, 'height': 800})
        self.addCleanup(ctx.close)
        if theme:
            ctx.add_init_script(f"try{{localStorage.setItem('kanbanTheme','{theme}')}}catch(e){{}}")
        page = ctx.new_page()
        self.errors = []
        page.on('pageerror', lambda e: self.errors.append(str(e)))
        page.goto(self.url + '/' + qs)
        page.wait_for_function("/direct|live/i.test(document.querySelector('#srcLine').textContent + document.querySelector('#conn').textContent)", timeout=10000)
        page.wait_for_timeout(300)
        return page

    def test_01_kanban_review_toast_and_history(self):
        page = self.open()
        self.assertEqual(page.locator('.toast').count(), 0)      # pas d'historique au chargement
        h = {'X-STT-Kanban': '1', 'Content-Type': 'application/json'}
        _, html = raw(self.port, 'GET', '/')
        m = re.search(r'name="stt-token" content="([^"]+)"', html)
        if m:
            h.update({'X-STT-Token': m.group(1), 'Origin': f'http://127.0.0.1:{self.port}'})
        st, body = raw(self.port, 'POST', '/api/kanban', h, json.dumps({'ops': [{'op': 'task', 'id': 'C0.1', 'set': {'status': 'review'}}]}))
        self.assertEqual(st, 200, body)
        t = page.locator('.toast.sev-attention')
        t.first.wait_for(timeout=10000)
        self.assertEqual(t.count(), 1)
        self.assertEqual(t.first.get_attribute('data-cat'), 'kanban')
        self.assertIn('KANBAN', t.first.inner_text())
        border = page.evaluate("getComputedStyle(document.querySelector('.toast')).borderLeftColor")
        amber = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()")
        self.assertEqual(border, 'rgb(255, 180, 84)')
        self.assertEqual(amber.lower(), '#ffb454')
        page.wait_for_timeout(2500)                                # attention : persiste
        self.assertEqual(page.locator('.toast.sev-attention').count(), 1)
        page.screenshot(path=str(SHOTS / 'toast-sombre.png'))
        # un rechargement ne rejoue pas la notice déjà émise
        page.reload()
        page.wait_for_function("window.sttNotify")
        page.wait_for_timeout(800)
        self.assertEqual(page.locator('.toast').count(), 0)
        self.assertEqual(self.errors, [])

    def test_02_info_disparait_error_persiste_et_clic(self):
        page = self.open()
        page.evaluate("""() => { sttNotify.push(%s); sttNotify.push(%s); sttNotify.push(%s); }""" % (
            json.dumps(notice(901, 'info')), json.dumps(notice(902, 'error', title='Panne')),
            json.dumps(notice(903, 'success', cat='kanban', target={'type': 'task', 'id': 'C0.1'}))))
        self.assertEqual(page.locator('.toast').count(), 3)
        colors = page.evaluate("[...document.querySelectorAll('.toast')].map(t => getComputedStyle(t).borderLeftColor)")
        self.assertEqual(colors, ['rgb(94, 234, 212)', 'rgb(230, 103, 103)', 'rgb(12, 163, 12)'])
        page.wait_for_timeout(3500)                                # délai 1,5 s en debug
        self.assertEqual(page.locator('.toast.sev-info').count(), 0)
        self.assertEqual(page.locator('.toast.sev-success').count(), 0)
        self.assertEqual(page.locator('.toast.sev-error').count(), 1)
        page.keyboard.press('Escape')                              # Échap ferme le plus récent
        self.assertEqual(page.locator('.toast').count(), 0)
        page.evaluate("sttNotify.push(%s)" % json.dumps(notice(904, 'attention', cat='kanban', target={'type': 'task', 'id': 'C0.1'})))
        page.locator('.toast').first.click()
        self.assertEqual(page.locator('#tabBtnKanban').get_attribute('aria-selected'), 'true')
        self.assertEqual(page.locator('.toast').count(), 0)
        self.assertEqual(self.errors, [])

    def test_03_max_cinq(self):
        page = self.open()
        page.evaluate("for (let i = 0; i < 8; i++) sttNotify.push(%s)" % json.dumps(notice(950, 'attention', title='n')))
        self.assertEqual(page.locator('.toast').count(), 5)

    def test_04_reglage_par_categorie_et_tester(self):
        page = self.open()
        self.assertEqual(page.locator('#btnAlerts').inner_text(), 'Alertes : on')
        page.click('#btnAlerts')
        self.assertTrue(page.locator('#alertsPop').is_visible())
        page.uncheck('#alertsPop [data-k="cat:kanban"]')
        page.keyboard.press('Escape')
        self.assertFalse(page.locator('#alertsPop').is_visible())
        saved = json.loads(page.evaluate("localStorage.getItem('stt-agents:notify')"))
        self.assertFalse(saved['cats']['kanban'])
        self.assertTrue(saved['toasts'])
        self.assertFalse(saved['desktop'])
        page.evaluate("sttNotify.push(%s)" % json.dumps(notice(960, 'attention', cat='kanban')))
        self.assertEqual(page.locator('.toast').count(), 0)
        page.evaluate("sttNotify.push(%s)" % json.dumps(notice(961, 'attention', cat='pr')))
        self.assertEqual(page.locator('.toast').count(), 1)
        page.locator('.toast .t-close').click()
        self.assertEqual(page.locator('.toast').count(), 0)
        # clic extérieur ferme, « Tester » produit 4 toasts
        page.click('#btnAlerts')
        page.click('#alertsTest')
        self.assertEqual(page.locator('.toast').count(), 4)
        page.mouse.click(5, 400)
        self.assertFalse(page.locator('#alertsPop').is_visible())
        # interrupteur général
        page.click('#btnAlerts')
        page.uncheck('#alertsPop [data-k="on"]')
        self.assertEqual(page.locator('#btnAlerts').inner_text(), 'Alertes : off')
        self.assertEqual(self.errors, [])

    def test_05_theme_clair_lisible(self):
        page = self.open(theme='light')
        page.evaluate("sttNotify.push(%s)" % json.dumps(notice(970, 'attention', title='Lisible ?', body='Texte secondaire du corps')))
        page.locator('.toast').wait_for()
        page.wait_for_timeout(400)
        res = page.evaluate("""() => {
          const t = document.querySelector('.toast'), bg = getComputedStyle(t).backgroundColor;
          const rgb = s => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
          const col = sel => rgb(getComputedStyle(t.querySelector(sel)).color);
          return {bg: rgb(bg), title: col('.t-title'), body: col('.t-body'), meta: col('.t-meta')};
        }""")
        for k in ('title', 'body', 'meta'):
            self.assertGreaterEqual(contrast(res[k], res['bg']), 4.5, (k, res))
        self.assertGreater(sum(res['bg']), 600)                    # fond clair
        page.screenshot(path=str(SHOTS / 'toast-clair.png'))
        self.assertEqual(self.errors, [])

    def test_06_onglets_et_theme(self):
        page = self.open(qs='')
        for tab in ('Timeline', 'Feed', 'Delivery', 'Kanban', 'Agents'):
            page.click('#tabBtn' + tab)
            self.assertEqual(page.locator('#tabBtn' + tab).get_attribute('aria-selected'), 'true')
        page.click('[data-theme-set="light"]')
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), 'light')
        self.assertEqual(page.evaluate("typeof window.sttNotify"), 'undefined')   # API de test seulement avec ?debug=1
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
