"""Usage : python3 eco_sim.py [--mesures target/mesures/missions-<modele>.json] — affiche l'heure de jeu de chaque jalon de la campagne.
(--mesures : MIN_LOCAL = mean_s/60 de la mesure, au lieu de la valeur supposée.)
Modèle d'équilibrage de la campagne STT (proposition SPEC-010). Pas de hasard : valeurs moyennes."""
UNIT_AVG = 300          # CR par conteneur (moyenne pondérée des natures, 20q-missions.js)
UNIT_INTER = 360        # entre systèmes : natures de valeur plus fréquentes (armes, minerais rares)
DISTF_LOCAL = 2.0       # facteur distance moyen local
DISTF_INTER = 2.5 + 0.12*8   # saut moyen 8 pc
FILL = 0.66             # remplissage moyen : quantité tirée entre C/3 et C
COSTS = 0.12            # carburant + taxes portuaires, part de la prime
MIN_LOCAL, MIN_INTER = 6.0, 9.0   # durée réelle d'une mission (min) ⚑ à mesurer
AUTO_EFF = 0.65         # rendement d'un vaisseau automatisé vs piloté
SAL = {'I': 2*275, 'II': 4*275, 'III': 6*300, 'IV': 10*300}   # CR/h d'équipage par palier
CAPT = 600              # CR/h capitaine d'un vaisseau automatisé
MAINT = 0.004           # entretien : part de la valeur du vaisseau par heure
RP_PER_MISSION = (2.0, 1.0)   # piloté, automatisé
RP_SCIENCE = 4.0              # PR/h moyens des missions scientifiques occasionnelles ⚑

class Ship:
    def __init__(s, name, cap, tier, value, auto=False, ftl=False):
        s.name, s.cap, s.tier, s.value, s.auto, s.ftl = name, cap, tier, value, auto, ftl
    def rate(s):  # CR/h net, missions/h
        inter = s.ftl
        mins = MIN_INTER if inter else MIN_LOCAL
        distf = DISTF_INTER if inter else DISTF_LOCAL
        unit = UNIT_INTER if inter else UNIT_AVG
        per_mission = s.cap*FILL*unit*distf*(1-COSTS)
        mph = 60/mins
        gross = per_mission*mph*(AUTO_EFF if s.auto else 1)
        cost = SAL[s.tier] + (CAPT if s.auto else 0) + MAINT*s.value
        return gross - cost, mph*(AUTO_EFF if s.auto else 1)

# étapes de la campagne : (libellé, coût CR, coût RP, action)
def run(start=4000, verbose=True):
    fleet = [Ship('Courlis (départ)', 4, 'I', 39000)]
    credits, rp, t = start, 0.0, 0.0
    T = lambda k: 1.08**k   # spécialisation douce : +8 % par techno déjà acquise
    steps = [
      ('+ module CARGO sur l\'amiral', 8000, 0, lambda f: (setattr(f[0],'cap',8), setattr(f[0],'tier','II'), setattr(f[0],'value',f[0].value+8000))),
      ('Techno Moteurs optimisés (Voyage I)', 3000, 8*T(0), None),
      ('Vaisseau n°2 : Courlis (auto)', 39000, 0, lambda f: f.append(Ship('Courlis 2', 4, 'I', 39000, auto=True))),
      ('+ TANK + CARGO (palier III)', 15000, 0, lambda f: (setattr(f[0],'cap',12), setattr(f[0],'tier','III'), setattr(f[0],'value',f[0].value+15000))),
      ('Techno Saut quantique (Voyage II)', 10000, 25*T(1), None),
      ('Kit de saut (long-courrier)', 18000, 0, lambda f: (setattr(f[0],'ftl',True), setattr(f[0],'value',f[0].value+18000))),
      ('Techno Habitabilité (Transport I)', 3000, 8*T(2), None),
      ('Vaisseau n°3 : paquebot (auto)', 62000, 0, lambda f: f.append(Ship('Paquebot', 8, 'III', 62000, auto=True))),
      ('Techno Ingénierie orbitale (Organisation III)', 25000, 50*T(3), None),
      ('Noyau de station (3 vaisseaux)', 140000, 0, None),
    ]
    log = []
    for label, cost, rpc, act in steps:
        while credits < cost or rp < rpc:
            dt = 1/60
            for s in fleet:
                r, mph = s.rate(); credits += r*dt; rp += mph*dt*(RP_PER_MISSION[1] if s.auto else RP_PER_MISSION[0])
            rp += RP_SCIENCE*dt
            t += dt
            if t > 20: raise SystemExit('bloqué à ' + label)
        credits -= cost; rp -= rpc
        if act: act(fleet)
        log.append((t, label, cost, round(credits), round(rp), sum(s.rate()[0] for s in fleet)))
    if verbose:
        for t_, l, c, cr, r, inc in log:
            print(f'{int(t_)}h{int((t_%1)*60):02d}  {l:<58} coût {c:>7,}  reste {cr:>7,} CR  RP {r:>3}  revenu net après {inc:>8,.0f} CR/h')
    return log

if __name__ == '__main__':
    import sys, json
    if '--mesures' in sys.argv:   # L0.3 : durée locale mesurée (src/test/chrono_missions_bench.py) à la place de MIN_LOCAL
        _m = json.load(open(sys.argv[sys.argv.index('--mesures') + 1], encoding='utf-8'))
        if not _m.get('mean_s'): raise SystemExit('mesure sans mean_s')
        MIN_LOCAL = _m['mean_s']/60
        print(f"Mesure {_m.get('modele')} : MIN_LOCAL = {MIN_LOCAL:.2f} min (au lieu de 6.0), n = {sum(1 for r in _m.get('runs', []) if r.get('s_mission') is not None)}")
    print('Revenus nets/h :', {s: round(Ship(s,c,tr,v,a,f).rate()[0]) for s,c,tr,v,a,f in [('départ',4,'I',39000,False,False),('amiral 8c',8,'II',47000,False,False),('amiral 12c saut',12,'III',80000,False,True),('auto 4c',4,'I',39000,True,False)]})
    run()
