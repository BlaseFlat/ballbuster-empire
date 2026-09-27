import numpy as np, math, json, sys
from qmath import *
from rig import Rig
import anim

RUS_RIG='/workspace/bb3d/out/rusana_rig.json'; GUY_RIG='/workspace/bb3d/out/guy_rig.json'
GUY_M = -0.78     # guy origin y in Rusana space (he faces +Y)
GROIN_KICK = (0,-0.07,0.845)
GROIN_KNEE = (0,-0.11,0.875)
HANDS_GROIN = (0,-0.16,0.90)

def guy_to_rus(p): return np.array([-p[0], GUY_M - p[1], p[2]])
def rus_to_guy(p): return np.array([-p[0], GUY_M - p[1], p[2]])

def resolve_key(R, key, extra=None):
    """apply IK entries of a key; returns E dict (armature-space deltas) and root."""
    E=dict(key["pose"]); root=np.array(key["root"],float)
    for ik in key["ik"]:
        side=ik["chain"]
        if ik.get("kind")=="instep":
            tgt=np.array(ik["target"],float)
            a0=R.head["foot_"+side]; b0=R.head["ball_"+side]
            instep_rest=a0+0.45*(b0-a0)+np.array([0,0,0.035])
            ank=tgt.copy()
            for it in range(6):
                E2,Dl=R.ik2(E,root,anim_chain(side),ank,ik["pole"],(0,-1,0))
                # foot pointed: foot cumulative = calf cumulative * plantar
                Dfoot=qmul(Dl, qeuler((ik.get("plantar",55),0,0)))
                E2["foot_"+side]=qnorm(qmul(qconj(Dl),Dfoot))
                D,H=R.fk(E2,root)
                cp=R.pt(D,H,"foot_"+side,instep_rest)
                ank=ank+(tgt-cp)
            E=E2
        elif ik.get("kind")=="knee":
            tgt=np.array(ik["target"],float)
            for it in range(8):
                D,H=R.fk(E,root)
                hip=H["thigh_"+side]; kj=H["calf_"+side]
                # kneecap point: joint + 0.045 along knee-forward (perp to thigh toward shin-front)
                thigh_dir=(kj-hip)/np.linalg.norm(kj-hip)
                shin=R.pt(D,H,"calf_"+side,R.head["foot_"+side])-kj
                fwd=-(shin/np.linalg.norm(shin)); fwd=fwd-thigh_dir*np.dot(fwd,thigh_dir); fwd/=np.linalg.norm(fwd)
                cap=kj+fwd*0.045+thigh_dir*0.02
                want_dir=(tgt-(cap-kj)-hip); l1=np.linalg.norm(kj-hip)
                # move root so that reach matches
                err=np.linalg.norm(want_dir)-l1
                root=root+want_dir/np.linalg.norm(want_dir)*err*ik.get("root_follow",1.0)
                D,H=R.fk(E,root); hip=H["thigh_"+side]; kj=H["calf_"+side]
                want=(tgt-(cap-kj))-hip
                Dth=D["thigh_"+side]
                Dnew=qmul(qbetween(kj-hip,want),Dth)
                E["thigh_"+side]=qnorm(qmul(qconj(D["pelvis"]),Dnew))
        elif ik.get("kind")=="foot":
            # planted foot: ankle target + cumulative foot orientation
            tgt=np.array(ik["target"],float)
            E,Dl=R.ik2(E,root,anim_chain(side),tgt,ik.get("pole",(0,-1,0)),(0,-1,0))
            Df=qeuler(ik.get("rot",(0,0,0)))
            E["foot_"+side]=qnorm(qmul(qconj(Dl),Df))
        elif ik.get("kind")=="hand":
            tgt=np.array(ik["target"],float)
            ch=("upperarm_"+side,"lowerarm_"+side,"hand_"+side)
            E,Dl=R.ik2(E,root,ch,tgt,ik.get("pole",(0,1,-1)),(0,1,0))
            if "rot" in ik:
                E["hand_"+side]=qnorm(qmul(qconj(Dl),qeuler(ik["rot"])))
    return E, root

def anim_chain(side): return ("thigh_"+side,"calf_"+side,"foot_"+side)

def catmull(ps, ts, t, loop=False):
    # ps list of arrays at times ts; returns value at t (hermite with finite-diff tangents)
    n=len(ts)
    if t<=ts[0]: return ps[0]
    if t>=ts[-1]: return ps[-1]
    i=max(j for j in range(n-1) if ts[j]<=t)
    t0,t1=ts[i],ts[i+1]; p0,p1=ps[i],ps[i+1]
    def tan(j):
        if 0<j<n-1: return (ps[j+1]-ps[j-1])/(ts[j+1]-ts[j-1])
        if loop and n>2:
            if j==0: return (ps[1]-ps[-2])/((ts[1]-ts[0])+(ts[-1]-ts[-2]))
            return (ps[1]-ps[-2])/((ts[1]-ts[0])+(ts[-1]-ts[-2]))
        return ps[j]*0
    m0=tan(i)*(t1-t0); m1=tan(i+1)*(t1-t0)
    u=(t-t0)/(t1-t0); u2=u*u; u3=u2*u
    return (2*u3-3*u2+1)*p0+(u3-2*u2+u)*m0+(-2*u3+3*u2)*p1+(u3-u2)*m1

def sample_clip(R, clip, loop=False, hold_keys=None):
    keys=sorted(clip.keys,key=lambda k:k["f"])
    resolved=[resolve_key(R,k) for k in keys]
    ts=[k["f"] for k in keys]
    bones=R.names
    out_frames=[]; roots=[]; shapes=[]
    shape_names=sorted({s for k in keys for s in k["shape"]})
    # sign-align quats per bone across keys
    qs={b:[] for b in bones}
    for Ek,_ in resolved:
        for b in bones:
            qv=Ek.get(b,QI)
            if qs[b] and np.dot(qs[b][-1],qv)<0: qv=-qv
            qs[b].append(qv)
    for f in range(0, int(ts[-1])+1):
        fr={}
        for b in bones:
            qv=qnorm(catmull(qs[b],ts,f,loop))
            fr[b]=R.local_q(b,qv)
        out_frames.append(fr)
        roots.append(catmull([r for _,r in resolved],ts,f,loop))
        shapes.append({s:float(np.clip(catmull([np.array(k["shape"].get(s,0.0)) for k in keys],ts,f,loop),0,1)) for s in shape_names})
    return out_frames, roots, shapes

def export(R, clips, path, loops):
    data={}
    for c in clips:
        frames,roots,shapes=sample_clip(R,c,loop=c.name in loops)
        # pelvis location in bone-local space: rest^-1 * off
        rq=R.rest["pelvis"]
        data[c.name]={"fps":c.fps,"n":len(frames),
            "bones":{b:[list(map(float,fr[b])) for fr in frames] for b in R.names},
            "pelvis_loc":[list(map(float,qrot(qconj(rq),r))) for r in roots],
            "root_world":[list(map(float,r)) for r in roots],
            "shapes":shapes,
            "guy":[k["guy"] for k in sorted(c.keys,key=lambda k:k["f"])],
            "keyframes":[k["f"] for k in sorted(c.keys,key=lambda k:k["f"])]}
    json.dump(data,open(path,"w"))

if __name__=="__main__":
    Rr,rclips,_,_=anim.build_rusana(RUS_RIG)
    Rg,gclips,_,_=anim.build_guy(GUY_RIG)
    export(Rr,rclips,'/workspace/bb3d/out/rus_anim.json',{"rus_idle","rus_walk"})
    export(Rg,gclips,'/workspace/bb3d/out/guy_anim.json',{"guy_idle"})
    print("exported")
