import numpy as np, json, math, sys
from qmath import *
from poses import solve
import clips as CL

def ground_clamp(R, E, root, clearance):
    D, H = R.fk(E, root)
    pts = [H[b] for b in R.names if not any(k in b for k in ("index","middle","ring","pinky","thumb"))]
    # add toe tips
    for s in ("l","r"):
        pts.append(R.pt(D,H,"ball_"+s,R.tail["ball_"+s]))
    mz = min(p[2] for p in pts)
    return root + np.array([0,0,clearance - mz])

def hermite(ps, ts, t, loop):
    n=len(ts)
    if t<=ts[0]: return ps[0]
    if t>=ts[-1]: return ps[-1]
    i=max(j for j in range(n-1) if ts[j]<=t)
    t0,t1=ts[i],ts[i+1]
    def tan(j):
        if 0<j<n-1: return (ps[j+1]-ps[j-1])/(ts[j+1]-ts[j-1])
        if loop: return (ps[1]-ps[-2])/((ts[1]-ts[0])+(ts[-1]-ts[-2]))
        return ps[j]*0
    m0=tan(i)*(t1-t0); m1=tan(i+1)*(t1-t0)
    u=(t-t0)/(t1-t0); u2=u*u; u3=u2*u
    return (2*u3-3*u2+1)*ps[i]+(u3-2*u2+u)*m0+(-2*u3+3*u2)*ps[i+1]+(u3-u2)*m1

def run(R, clip):
    keys = sorted(clip.k, key=lambda x: x[0])
    ts = [f for f,_ in keys]
    solved = []
    for f,P in keys:
        E, root = solve(R, P)
        if getattr(P, "ground", None) is not None:
            root = ground_clamp(R, E, root, P.ground)
        solved.append((E, root, P))
    qs = {b: [] for b in R.names}
    for E,_,_ in solved:
        for b in R.names:
            q_ = E.get(b, QI)
            if qs[b] and np.dot(qs[b][-1], q_) < 0: q_ = -q_
            qs[b].append(q_)
    snames = sorted({s for _,_,P in solved for s in P.shape})
    frames=[]
    N = int(ts[-1])
    for f in range(N+1):
        E = {b: qnorm(hermite(qs[b], ts, f, clip.loop)) for b in R.names}
        root = hermite([r for _,r,_ in solved], ts, f, clip.loop)
        sh = {s: float(np.clip(hermite([np.array(P.shape.get(s,0.0)) for _,_,P in solved], ts, f, clip.loop),0,1)) for s in snames}
        if getattr(clip, "post", None) is not None: E = clip.post(f, E, root)   # per-frame overrides (e.g. ponytail secondary motion, actions.py)
        frames.append((E, root, sh))
    return frames, [(f, P.guy) for f,P in keys]

def export(R, clips, path):
    out = {}
    for c in clips:
        frames, gk = run(R, c)
        rq = R.rest["pelvis"]
        out[c.name] = {"fps": c.fps, "loop": c.loop, "n": len(frames),
            "bones": {b: [list(map(float, R.local_q(b, E[b]))) for E,_,_ in frames] for b in R.names},
            "pelvis_loc": [list(map(float, qrot(qconj(rq), r))) for _,r,_ in frames],
            "root": [list(map(float, r)) for _,r,_ in frames],
            "shapes": [sh for _,_,sh in frames],
            "keys": gk,
            "expr": {"frames": [f for f,_ in sorted(c.k,key=lambda x:x[0])], "names": sorted({s for _,P in c.k for s in P.shape}),
                     "vals": [[P.shape.get(s,0.0) for s in sorted({s for _,P in c.k for s in P.shape})] for _,P in sorted(c.k,key=lambda x:x[0])]}}
    json.dump(out, open(path, "w"))
    return out

if __name__ == "__main__":
    Rr, rc = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
    Rg, gc = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
    o1 = export(Rr, rc, '/workspace/bb3d/out/rus_anim.json')
    o2 = export(Rg, gc, '/workspace/bb3d/out/guy_anim.json')
    meta = {"fps": 30, "guy_m": CL.GUY_M, "clips": {}}
    for o in (o1, o2):
        for k, v in o.items():
            meta["clips"][k] = {"n": v["n"], "loop": v["loop"], "expr": v["expr"], "keys": v["keys"]}
            meta["clips"][k].update(CL.EXTRA_META.get(k, {}))   # new action clips: speed / root_end / travel (actions.py)
    json.dump(meta, open('/workspace/bb3d/out/anim_meta.json', 'w'))
    print("OK")
