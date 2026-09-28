# Mesh-based fitting lab. modes: kick_search, knee_search, check (jobs)
import bpy, json, sys, math
sys.path.insert(0, "/workspace/bb3d/anim")
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from qmath import *
import clips as CL, author2 as A2, metrics as MT, strikes as ST
from poses import solve
argv = sys.argv[sys.argv.index("--")+1:]
mode = argv[0]; spec = json.load(open(argv[1])) if len(argv) > 1 else {}
import os
bpy.ops.wm.open_mainfile(filepath=os.environ.get("BB_RUS_BLEND", "/workspace/bb3d/out/rusana_anim.blend"))
sc = bpy.context.scene
with bpy.data.libraries.load(os.environ.get("BB_GUY_BLEND", "/workspace/bb3d/out/guy_anim.blend"), link=False) as (src, dst):
    dst.objects = [n for n in src.objects]
for o in dst.objects:
    if o: sc.collection.objects.link(o)
rarm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Rusana")][0]
garm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Guy")][0]
for a in (rarm, garm):
    if a.animation_data:
        a.animation_data.action = None
        for t in a.animation_data.nla_tracks: t.mute = True
for pb in list(rarm.pose.bones)+list(garm.pose.bones): pb.rotation_mode='QUATERNION'
Rr, rclips = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
Rg, gclips = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
cache = {}
def clipframe(R, clips, name, f):
    if name not in cache: cache[name] = A2.run(R, [c for c in clips if c.name == name][0])[0]
    fr = cache[name]; return fr[max(0, min(f, len(fr)-1))][:2]
def apply(arm, R, E, root):
    for b in R.names:
        pb = arm.pose.bones[b]; pb.rotation_quaternion = Quaternion(R.local_q(b, E.get(b, QI))); pb.location = (0,0,0)
    arm.pose.bones["pelvis"].location = Vector(qrot(qconj(R.rest["pelvis"]), root))
def eval_mesh(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    mw = o.matrix_world; vs = [mw @ v.co for v in m.vertices]; ps = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear(); return vs, ps
HER = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Rusana") and not any(k in o.name for k in ("hair","ponytail"))]
HIS = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Guy") and "hair" not in o.name]
def l2w(p, m): return np.array([-p[0], m - p[1], p[2]])
def w2l(p, m): return np.array([-p[0], m - p[1], p[2]])
GUY_CACHE = {}
def set_guy(gE, groot, m, key=None):
    garm.location = (0, m, 0); garm.rotation_euler = (0, 0, math.pi)
    apply(garm, Rg, gE, groot); bpy.context.view_layer.update()
    hv=[]; hp=[]
    for o in HIS:
        vs,ps=eval_mesh(o); off=len(hv); hv+=vs; hp+=[tuple(i+off for i in p) for p in ps]
    global HIS_OWNER
    HIS_OWNER = []
    for o in HIS: HIS_OWNER += [o.name.split("_")[-1]] * len(o.data.polygons)
    global BODY_BVH
    bv=[]; bp=[]
    for o in HIS:
        if "body" not in o.name: continue
        vs,ps=eval_mesh(o); off=len(bv); bv+=vs; bp+=[tuple(i+off for i in p) for p in ps]
    BODY_BVH = BVHTree.FromPolygons(bv, bp)
    return BVHTree.FromPolygons(hv, hp), hv
def instep_pt(E, root):
    D,H = Rr.fk(E, root); a=H["foot_r"]; b=H["ball_r"]
    up = Rr.pt(D,H,"foot_r", Rr.head["foot_r"]+np.array([0,0,0.04])) - a
    return a + 0.5*(b-a) + up*0.8
BANDS = {}
GG = {}
CLOTHP = [0.0, None]
CLOTH_T = float(__import__("os").environ.get("CLOTH_T", "0.03"))
_VG = {}
def VGRP(o, vi):
    if o.name not in _VG:
        names = {g.index: g.name for g in o.vertex_groups}
        _VG[o.name] = [names.get(max(v.groups, key=lambda g: g.weight).group, "?") if len(v.groups) else "?" for v in o.data.vertices]
    return _VG[o.name][vi]
def measure(rE, rroot, bvh, m, zmin=0.0):
    apply(rarm, Rr, rE, rroot); bpy.context.view_layer.update()
    maxd=0; cnt=0; worst=None; gap=9; gp=None; toe_y=-9; BANDS.clear(); GG.clear(); CLOTHP[0] = 0.0; CLOTHP[1] = None
    for o in HER:
        vs,_ = eval_mesh(o)
        for vi, v in enumerate(vs):
            if v.z < zmin: continue
            loc, nrm, idx, d = bvh.find_nearest(v, 0.25)
            if loc is None: continue
            inside = (v - loc).dot(nrm) < 0
            if inside and HIS_OWNER[idx] != "body" and d > CLOTH_T:
                # thin cloth shell: deep "inside" only real if also inside his body mesh
                bl, bn, bi, bd = BODY_BVH.find_nearest(v, 0.2)
                inside = bl is not None and (v - bl).dot(bn) < 0
                if inside: d = bd
                else:
                    if d > CLOTHP[0]: CLOTHP[0] = d; CLOTHP[1] = (o.name.split("_")[-1], VGRP(o, vi), np.round(w2l(np.array(v), m),2).tolist(), HIS_OWNER[idx])
            if inside:
                if d < 0.12:
                    cnt += 1
                    key_ = (o.name.split("_")[-1], round(v.z, 1), VGRP(o, vi))
                    if d > BANDS.get(key_, (0,))[0]: BANDS[key_] = (round(d, 3), np.round(w2l(np.array(v), m),2).tolist(), np.round(w2l(np.array(loc), m),2).tolist(), HIS_OWNER[idx] if idx < len(HIS_OWNER) else "?")
                    if d > maxd: maxd = d; worst = (np.round(w2l(np.array(v), m),3).tolist(), o.name.split("_")[-1])
            else:
                if d < gap: gap = d; gp = (np.array(v), o.name.split("_")[-1])
                b_ = VGRP(o, vi)
                gk = "hand" if any(t in b_ for t in ("hand","index","middle","ring","pinky","thumb")) else ("leg" if any(t in b_ for t in ("thigh","calf","foot","ball")) else "other")
                if d < GG.get(gk, 9): GG[gk] = round(d, 4)
        if "shoes" in o.name:
            for v in vs:
                if v.x < 0.04 and v.z > 0.25: toe_y = max(toe_y, w2l(np.array(v), m)[1])
    grp = {}
    for k, v in BANDS.items():
        b = k[2]
        g = "leg" if any(t in b for t in ("thigh","calf","foot","ball")) else ("arm" if any(t in b for t in ("arm","hand","index","middle","ring","pinky","thumb")) else "torso")
        if v[0] > grp.get(g, (0,))[0]: grp[g] = v
    return dict(cloth=round(CLOTHP[0],4), cloth_at=CLOTHP[1], ggap=dict(GG), grp=grp, bands={f"{k[0]}@{k[1]}:{k[2]}": v for k, v in sorted(BANDS.items())}, pen=round(maxd,4), cnt=cnt, worst=worst, gap=round(gap,4), gap_part=gp[1] if gp else None,
                gap_pt_local=np.round(w2l(gp[0], m),3).tolist() if gp else None, shoe_back_y=round(toe_y,3))
def guy_landmarks(hv, m):
    L = [w2l(np.array(v), m) for v in hv]
    bb = [p[1] for p in L if abs(p[0]) < 0.16 and 0.70 < p[2] < 1.05]
    butt = max(bb) if bb else -9
    cen = [p for p in L if abs(p[0]) < 0.025 and -0.10 < p[1] < 0.10 and 0.5 < p[2] < 1.0]
    crotch = min(p[2] for p in cen) if cen else -9
    return dict(butt_y=round(butt,3), crotch_z=round(crotch,3))
def guy_pelvis_w(gE, groot, m):
    D,H = Rg.fk(gE, groot); return l2w(H["pelvis"], m)
out = []
if mode == "kick_search":
    gE, groot = clipframe(Rg, gclips, "guy_idle", 0)
    for D in spec["D"]:
        # place guy so pelvis-pelvis horizontal distance = D (her pelvis y from her stance pose at dy=0)
        E0, r0 = solve(Rr, CL.rus_stance()); Dh, Hh = Rr.fk(E0, r0)
        gp_local = Rg.fk(gE, groot)[1]["pelvis"]
        m = Hh["pelvis"][1] - D + gp_local[1]
        bvh, hv = set_guy(gE, groot, m); LM = guy_landmarks(hv, m)
        print("GUY", D, m, LM)
        for knee in spec["knee"]:
            for flex in np.arange(spec["flex"][0], spec["flex"][1], spec["flex"][2]):
                for point, dy in [(pp, dd) for pp in spec["point"] for dd in spec.get("dy", [0.0])]:
                    P = ST.kick_pose(float(flex), knee, point, dy=dy, rise=spec.get("rise",0.04), lean=spec.get("lean",12))
                    E, root = solve(Rr, P); ins = w2l(instep_pt(E, root), m)
                    if not (spec["iz"][0] <= ins[2] <= spec["iz"][1] and spec["iy"][0] <= ins[1] <= spec["iy"][1]): continue
                    r = measure(E, root, bvh, m, zmin=0.3)
                    Lm = MT.leg_metrics(Rr, E, root)
                    r.update(D=D, dy=dy, knee=knee, flex=float(flex), point=point, instep=np.round(ins,3).tolist(), shin_elev=round(Lm["shin_elev"],1),
                             thigh_elev=round(Lm["thigh_elev"],1), knee_inner=round(Lm["knee_inner"],1), foot_point=round(Lm["foot_point"],1), knee_z=round(Lm["knee_z"],3), **LM)
                    print("K", json.dumps(r)); out.append(r)
if mode == "knee_search":
    gname, gf = spec.get("guy", ["guy_idle", 0])
    gE, groot = clipframe(Rg, gclips, gname, gf)
    for D in spec["D"]:
        E0, r0 = solve(Rr, ST.knee_pose(85, 40, 60)); Dh, Hh = Rr.fk(E0, r0)
        gp_local = Rg.fk(gE, groot)[1]["pelvis"]
        m = Hh["pelvis"][1] - D + gp_local[1]
        bvh, hv = set_guy(gE, groot, m); LM = guy_landmarks(hv, m)
        print("GUY", D, m, LM)
        for flex in spec["flex"]:
            for knee in spec["knee"]:
                for rise in spec.get("rise", [0.03]):
                    for dy in spec.get("dy", [0.0]):
                        P = ST.knee_pose(flex, knee, spec.get("point", 60), dy=dy, rise=rise, lean=spec.get("lean", 7), gm=m)
                        E, root = solve(Rr, P)
                        r = measure(E, root, bvh, m, zmin=0.3)
                        Lm = MT.leg_metrics(Rr, E, root); Dd, Hd = Rr.fk(E, root)
                        dist = abs(Hd["pelvis"][1] - guy_pelvis_w(gE, groot, m)[1])
                        kc = Rr.pt(Dd, Hd, "calf_r", Rr.head["calf_r"] + np.array([0, -0.045, 0.0]))  # front of knee
                        r.update(D=D, flex=flex, knee=knee, rise=rise, dy=dy, pel_dist=round(dist,3), knee_z=round(Lm["knee_z"],3), hip_flex=round(Lm["hip_flex"],1),
                                 knee_inner=round(Lm["knee_inner"],1), kneefront_local=np.round(w2l(kc, m),3).tolist(), ankle_local=np.round(w2l(Lm["ank"], m),3).tolist(), **LM)
                        print("N", json.dumps(r)); out.append(r)
if mode == "check":
    for job in spec["jobs"]:
        gE, groot = clipframe(Rg, gclips, job["guy"], job["gf"])
        if "rus_pose" in job:
            P = getattr(ST, job["rus_pose"]["fn"])(**job["rus_pose"]["params"]); rE, rroot = solve(Rr, P)
        else: rE, rroot = clipframe(Rr, rclips, job["rus"], job["rf"])
        m = job["guy_m"]
        bvh, hv = set_guy(gE, groot, m); LM = guy_landmarks(hv, m)
        r = measure(rE, rroot, bvh, m, zmin=job.get("zmin", 0.0))
        Lm = MT.leg_metrics(Rr, rE, rroot); B = MT.body_metrics(Rr, rE, rroot)
        Dd, Hd = Rr.fk(rE, rroot)
        r.update(tag=job.get("tag"), rf=job.get("rf"), gf=job["gf"], guy=job["guy"], pel_dist=round(abs(Hd["pelvis"][1]-guy_pelvis_w(gE, groot, m)[1]),3),
                 instep=np.round(w2l(instep_pt(rE, rroot), m),3).tolist(), toe=np.round(w2l(Lm["toe"], m),3).tolist(), knee_z=round(Lm["knee_z"],3), knee_inner=round(Lm["knee_inner"],1),
                 shin_elev=round(Lm["shin_elev"],1), thigh_elev=round(Lm["thigh_elev"],1), hip_flex=round(Lm["hip_flex"],1), foot_point=round(Lm["foot_point"],1),
                 lean=round(B["lean"],1), heel_l=round(B["heel_l"],3), pelvis_z=round(Hd["pelvis"][2],3), **LM)
        print("C", json.dumps(r)); out.append(r)
if spec.get("out"): json.dump(out, open(spec["out"], "w"))
if mode == "render":
    sc.render.engine = 'CYCLES'; sc.cycles.samples = spec.get("samples", 16); sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
    sc.render.resolution_x = spec.get("w", 900); sc.render.resolution_y = spec.get("h", 900)
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [v for v in ['AgX']] else 'Filmic'
    world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.33, 0.36, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    def light(name, loc, energy, size=2):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size
        o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, -0.35, 0.9)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    light("key", (2.8, -2.5, 3.2), 700); light("fill", (-3, -1.5, 2), 250); light("rim", (0.5, 2.5, 3), 450)
    bpy.ops.mesh.primitive_plane_add(size=10); fl = bpy.context.active_object
    mt = bpy.data.materials.new("floor"); mt.use_nodes = True; mt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.2, 0.22, 1); fl.data.materials.append(mt)
    cam = bpy.data.cameras.new("C"); co = bpy.data.objects.new("C", cam); sc.collection.objects.link(co); sc.camera = co
    for job in spec["jobs"]:
        gE, groot = clipframe(Rg, gclips, job["guy"], job["gf"])
        if "rus_pose" in job:
            P = getattr(ST, job["rus_pose"]["fn"])(**job["rus_pose"]["params"]); rE, rroot = solve(Rr, P)
        else: rE, rroot = clipframe(Rr, rclips, job["rus"], job["rf"])
        m = job["guy_m"]; garm.location = (0, m, 0); garm.rotation_euler = (0, 0, math.pi)
        apply(garm, Rg, gE, groot); apply(rarm, Rr, rE, rroot); bpy.context.view_layer.update()
        az = math.radians(job.get("az", 70)); el = math.radians(job.get("el", 6)); d = job.get("dist", 3.0)
        t = Vector(job.get("target", (0, m/2, 0.85)))
        co.location = t + Vector((math.sin(az)*math.cos(el)*d, -math.cos(az)*math.cos(el)*d, math.sin(el)*d))
        co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler(); cam.lens = job.get("lens", 50)
        sc.render.filepath = job["out"]; bpy.ops.render.render(write_still=True); print("RENDERED", job["out"])
