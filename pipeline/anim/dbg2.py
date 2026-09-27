import numpy as np, clips as CL
from poses import solve
Rg, gc = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
cl={c.name:c for c in gc}
P=dict(cl["guy_floor"].k)[0]
E,root=solve(Rg,P); D,H=Rg.fk(E,root)
for b in ["pelvis","spine_03","head","thigh_l","calf_l","foot_l","thigh_r","calf_r","foot_r","hand_l","hand_r"]:
    print(b, np.round(H[b],3))
