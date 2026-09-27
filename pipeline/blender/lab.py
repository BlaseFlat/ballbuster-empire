# Direct evaluation lab: builds clips in python, poses both rigs, measures. args: jobs.json
import bpy, json, sys, math, os
sys.path.insert(0, "/workspace/bb3d/anim")
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from qmath import *
import importlib, clips as CL, author2 as A2, metrics as MT
argv = sys.argv[sys.argv.index("--")+1:]
jobs = json.load(open(argv[0]))
bpy.ops.wm.open_mainfile(filepath="/workspace/bb3d/out/rusana_anim.blend")
sc = bpy.context.scene
with bpy.data.libraries.load("/workspace/bb3d/out/guy_anim.blend", link=False) as (src, dst):
    dst.objects = [n for n in src.objects]
for o in dst.objects:
    if o: sc.collection.objects.link(o)
rarm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Rusana")][0]
garm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Guy")][0]
for a in (rarm, garm):
    if a.animation_data: a.animation_data.action = None; [setattr(t, "mute", True) for t in a.animation_data.nla_tracks]
for pb in list(rarm.pose.bones)+list(garm.pose.bones): pb.rotation_mode='QUATERNION'
Rr, rclips = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
Rg, gclips = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
cache = {}
def frames(R, clips, name):
    if name not in cache:
        c = [c for c in clips if c.name == name][0]
        cache[name] = A2.run(R, c)[0]
    return cache[name]
def apply(arm, R, E, root):
    for b in R.names:
        pb = arm.pose.bones[b]; pb.rotation_quaternion = Quaternion(R.local_q(b, E.get(b, QI))); pb.location = (0,0,0)
    arm.pose.bones["pelvis"].location = Vector(qrot(qconj(R.rest["pelvis"]), root))
def eval_mesh(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    mw = o.matrix_world
    vs = [mw @ v.co for v in m.vertices]; ps = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear(); return vs, ps
HER = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Rusana") and not any(k in o.name for k in ("hair","ponytail"))]
HIS = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Guy") and "hair" not in o.name]
def g2l(p, m):  # world -> guy local (guy at (0,m,0) rotated 180)
    return np.array([-p[0], m - p[1], p[2]])
res = []
for job in jobs["frames"]:
    m = job["guy_m"]
    garm.location = (0, m, 0); garm.rotation_euler = (0, 0, math.pi)
    if "rus_pose" in job:
        import strikes as ST
        from poses import solve as _solve
        rp = job["rus_pose"]; P = getattr(ST, rp["fn"])(**rp["params"]); rE, rroot = _solve(Rr, P)
        job.setdefault("rus", rp["fn"]); job.setdefault("rf", -1)
    else:
        rE, rroot, _ = frames(Rr, rclips, job["rus"])[min(job["rf"], len(frames(Rr, rclips, job["rus"]))-1)]
    gE, groot, _ = frames(Rg, gclips, job["guy"])[min(job["gf"], len(frames(Rg, gclips, job["guy"]))-1)]
    apply(rarm, Rr, rE, rroot); apply(garm, Rg, gE, groot)
    bpy.context.view_layer.update()
    hv=[]; hp=[]; pants=[]; hisall=[]
    for o in HIS:
        vs,ps=eval_mesh(o); off=len(hv); hv+=vs; hp+=[tuple(i+off for i in p) for p in ps]
        if "pants" in o.name: pants += vs
    bvh = BVHTree.FromPolygons(hv, hp)
    # guy landmarks (guy-local)
    PL = [g2l(np.array(v), m) for v in pants]
    cen = [p for p in PL if abs(p[0]) < 0.03 and -0.12 < p[1] < 0.12 and 0.5 < p[2] < 1.0]
    crotch_z = min(p[2] for p in cen) if cen else None
    HL = [g2l(np.array(v), m) for v in hv]
    butt = [p for p in HL if abs(p[0]) < 0.16 and 0.70 < p[2] < 1.05]
    butt_y = max(p[1] for p in butt) if butt else None
    front = [p for p in HL if abs(p[0]) < 0.06 and 0.72 < p[2] < 0.90]
    front_y = min(p[1] for p in front) if front else None
    maxd=0; cnt=0; worst=None; gap=9; gap_pt=None; toe_y=-9; per={}
    zone = job.get("zone", None)
    for o in HER:
        vs,_ = eval_mesh(o)
        for v in vs:
            loc, nrm, idx, d = bvh.find_nearest(v, 0.2)
            if loc is None: continue
            if (v - loc).dot(nrm) < 0:
                if d < 0.12:
                    cnt += 1
                    if d > maxd: maxd = d; worst = (tuple(np.round(g2l(np.array(v), m),3)), o.name.split("_")[-1])
            elif d < gap:
                gap = d; gap_pt = (tuple(np.round(g2l(np.array(loc), m),3)), o.name.split("_")[-1])
        if "shoes" in o.name:
            for v in vs:
                if v.x < 0.03 and v.z > 0.3:  # right shoe raised
                    toe_y = max(toe_y, g2l(np.array(v), m)[1])
    L = MT.leg_metrics(Rr, rE, rroot, job.get("side", "r")); B = MT.body_metrics(Rr, rE, rroot)
    Dg, Hg = Rg.fk(gE, groot)
    gpel = g2l(np.array(Hg["pelvis"]) * np.array([1,1,1]), 0)  # guy armature space pelvis
    gpel_w = np.array([-Hg["pelvis"][0], m - Hg["pelvis"][1], Hg["pelvis"][2]])
    pel_dist = abs(B["pelvis"][1] - gpel_w[1])
    r = dict(tag=job.get("tag",""), rus=job["rus"], rf=job["rf"], guy=job["guy"], gf=job["gf"], guy_m=m,
             pen_max=round(maxd,4), pen_cnt=cnt, pen_at=worst, gap=round(gap,4), gap_at=gap_pt,
             crotch_z=round(crotch_z,3) if crotch_z else None, butt_y=round(butt_y,3) if butt_y else None, front_y=round(front_y,3) if front_y else None,
             shoe_max_y=round(toe_y,3), pelvis_dist=round(pel_dist,3),
             knee_z=round(L["knee_z"],3), hip_z=round(L["hip_z"],3), knee_inner=round(L["knee_inner"],1), thigh_elev=round(L["thigh_elev"],1),
             shin_elev=round(L["shin_elev"],1), hip_flex=round(L["hip_flex"],1), foot_point=round(L["foot_point"],1),
             lean=round(B["lean"],1), heel_l=round(B["heel_l"],3), knee_local=tuple(np.round(g2l(L["knee"], m),3)), ank_local=tuple(np.round(g2l(L["ank"], m),3)),
             gpelvis_z=round(gpel_w[2],3))
    res.append(r)
    print("R", json.dumps(r))
if jobs.get("out"): json.dump(res, open(jobs["out"], "w"), indent=0)
