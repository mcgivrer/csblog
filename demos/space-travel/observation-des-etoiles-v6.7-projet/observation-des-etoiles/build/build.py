# Assemble la démo : moteur du jeu inchangé + garde + scripts de la démo -> dist/observation-des-etoiles.html
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(R, *a)
rd = lambda *a: open(P(*a), encoding='utf8').read()
s = rd('engine', 'game.html')
s = s.replace('<title>Voyage spatial — Navigation quantique</title>', '<title>Space Travel & Transport — Observation des étoiles</title>')
guard = rd('src', 'head_guard2.js')
demo = '\n'.join(rd('src', f) for f in ['planets.js', 'asteroids.js', 'stars.js', 'shipdrive.js', 'shipglass.js', 'shipwear.js', 'smallcraft.js', 'cine.js'])
live = rd('src', 'live2.js')
i = s.index('<script>'); s = s[:i] + '<script>\n' + guard + '\n</script>\n' + s[i:]
j = s.rindex('</body>'); s = s[:j] + '<script>\n' + demo + '\n</script>\n<script>\n' + live + '\n</script>\n' + s[j:]
os.makedirs(P('dist'), exist_ok=True)
open(P('dist', 'observation-des-etoiles.html'), 'w', encoding='utf8').write(s)
print('dist/observation-des-etoiles.html', len(s))
