import json, numpy as np
from qmath import *
from rig import Rig
import clips as CL
Rr=Rig('/workspace/bb3d/out/rusana_rig.json'); Rg=Rig('/workspace/bb3d/out/guy_rig.json')
ra=json.load(open('/workspace/bb3d/out/rus_anim.json')); ga=json.load(open('/workspace/bb3d/out/guy_anim.json'))
def pose(R,clip,f):
    f=min(f,clip["n"]-1)
    E={b:qmul(R.rest[b],qmul(np.array(clip["bones"][b][f]),qconj(R.rest[b]))) for b in R.names}
    return R.fk(E,np.array(clip["root"][f]))
def segdist(p1,q1,p2,q2):
    # closest distance between segments
    d1=q1-p1; d2=q2-p2; r=p1-p2; a=d1@d1; e=d2@d2; f=d2@r
    c=d1@r; b=d1@d2; den=a*e-b*b
    s=np.clip((b*f-c*e)/den,0,1) if den>1e-9 else 0.0
    t=(b*s+f)/e; 
    if t<0: t=0; s=np.clip(-c/a,0,1)
    elif t>1: t=1; s=np.clip((b-c)/a,0,1)
    return np.linalg.norm((p1+d1*s)-(p2+d2*t))
def check(rname, contact, gname="guy_flinch", gstart_clip="guy_idle"):
    rc=ra[rname]; gc=ga[gname]
    print("==",rname)
    for f in range(rc["n"]):
        D,H=pose(Rr,rc,f)
        gf=f-contact
        Dg,Hg=pose(Rg,gc if gf>=0 else ga[gstart_clip], max(gf,0))
        Hg={k:CL.g2w(v) for k,v in Hg.items()}
        her=[("shin",H["calf_r"],H["foot_r"],0.045),("foot",H["foot_r"],H["ball_r"],0.04),("thigh",H["thigh_r"],H["calf_r"],0.07)]
        his=[("thL",Hg["thigh_l"],Hg["calf_l"],0.075),("thR",Hg["thigh_r"],Hg["calf_r"],0.075),("pelv",Hg["pelvis"],Hg["spine_01"],0.13),("calfL",Hg["calf_l"],Hg["foot_l"],0.05),("calfR",Hg["calf_r"],Hg["foot_r"],0.05)]
        worst=min(((segdist(a1,a2,b1,b2)-ra_-rb,n1+"-"+n2) for n1,a1,a2,ra_ in her for n2,b1,b2,rb in his))
        # groin contact metric: distance of groin point to her contact part
        groin=CL.g2w(np.array([0,-0.06,0.87])) if gf<=0 else None
        print(f"f{f:02d} gf{gf:+03d} worst_clear={worst[0]:+.3f} {worst[1]}")
check("rus_kick_up",15)
check("rus_knee",12)
