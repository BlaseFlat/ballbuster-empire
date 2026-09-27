import numpy as np, clips as CL
from poses import solve
Rr, rc = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
cl={c.name:c for c in rc}
def show(name, f):
    P=dict(cl[name].k)[f]
    E,root=solve(Rr,P)
    D,H=Rr.fk(E,root)
    f3=lambda v:"(%.3f %.3f %.3f)"%tuple(v)
    print(name,f,"root",f3(root))
    for b in ["pelvis","thigh_r","calf_r","foot_r","ball_r","thigh_l","calf_l","foot_l","ball_l","head","hand_l","hand_r"]:
        print("  ",b,f3(H[b]))
    if P.kick2: print("  target",f3(P.kick2["contact"]), {k:f3(v) for k,v in P._dbg.items()})
    if P.knee: print("  target",f3(P.knee["cap"]), {k:f3(v) for k,v in P._dbg.items()})
show("rus_kick_up",15); show("rus_knee",12); show("rus_idle",0)
print("KICK_C",CL.KICK_C,"KNEE_C",CL.KNEE_C)
