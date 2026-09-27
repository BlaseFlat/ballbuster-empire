import bpy, json, sys, math, itertools
sys.path.insert(0, "/workspace/bb3d/anim")
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from qmath import *
import clips as CL
from poses import Pose, solve
argv = sys.argv[sys.argv.index("--")+1:]
mode = argv[0]
bpy.ops.wm.open_mainfile(filepath="/workspace/bb3d/out/rusana_anim.blend")
sc = bpy.context.scene
with bpy.data.libraries.load("/workspace/bb3d/out/guy_anim.blend", link=False) as (src, dst):
    dst.objects = [n for n in src.objects]; dst.actions = [n for n in src.actions]
for o in dst.objects:
    if o: sc.collection.objects.link(o)
rarm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Rusana")][0]
garm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Guy")][0]
garm.location = (0, CL.GUY_M, 0); garm.rotation_euler = (0, 0, math.pi)
for pb in list(rarm.pose.bones)+list(garm.pose.bones): pb.rotation_mode='QUATERNION'
Rr, rclips = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
Rg, gclips = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
def apply(arm, R, E, root):
    for b in R.names:
        pb = arm.pose.bones[b]; q = R.local_q(b, E.get(b, QI)); pb.rotation_quaternion = Quaternion(q)
        pb.location = (0,0,0)
    arm.pose.bones["pelvis"].location = Vector(qrot(qconj(R.rest["pelvis"]), root))
def eval_mesh(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    vs = [o.matrix_world @ v.co for v in m.vertices]; ps = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear(); return vs, ps
her_parts = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Rusana") and ("body" in o.name or "shoes" in o.name)]
his_parts = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Guy") and ("body" in o.name or "pants" in o.name)]
gp = {c.name: c for c in gclips}
def guy_pose(name, idx):
    return solve(Rg, sorted(gp[name].k, key=lambda x: x[0])[idx][1])
def measure(Pr, gE, groot):
    E, root = solve(Rr, Pr)
    apply(rarm, Rr, E, root); apply(garm, Rg, gE, groot)
    bpy.context.view_layer.update()
    hv=[]; hp=[]
    for o in his_parts:
        vs,ps=eval_mesh(o); off=len(hv); hv+=vs; hp+=[tuple(i+off for i in p) for p in ps]
    bvh = BVHTree.FromPolygons(hv, hp)
    maxd=0; cnt=0; mind_out=9; touch_pt=None
    for o in her_parts:
        vs,_ = eval_mesh(o)
        for v in vs:
            if v.z > 1.1 or v.y > -0.2: continue
            loc, nrm, idx, d = bvh.find_nearest(v)
            if loc is None or d > 0.3: continue
            if (v - loc).dot(nrm) < 0:
                cnt += 1; maxd = max(maxd, d)
            elif d < mind_out: mind_out = d; touch_pt = loc
    return maxd, cnt, mind_out, touch_pt
if mode == "kick":
    gE, groot = guy_pose("guy_flinch", 0)
    res = []
    for yc, zc, sv, pt in itertools.product([-0.10,-0.08,-0.06,-0.04], [0.76,0.79,0.82,0.85], [38,42,46], [35,45]):
        C = CL.g2w((0.0, yc, zc))
        P = Pose(spine={"pelvis": (2,0,4), "spine_01": (-4,0,0), "spine_02": (-5,0,-1), "spine_03": (-3,0,0), "neck_01": (3,0,0), "head": (8,0,2)},
            root=(0,0,0), feet={"l": {"ball": [0.10,-0.30,0.012], "pitch": -26, "yaw": 10, "pole": (0.25,-1,0.3)}},
            kick2={"side": "r", "contact": list(C), "shin_from_vert": sv, "s": 1.0, "point": pt, "surf": 0.04})
        maxd, cnt, mo, tp = measure(P, gE, groot)
        tpg = CL.w2g(np.array(tp)) if tp is not None else None
        res.append((maxd, cnt, mo, yc, zc, sv, pt, tuple(np.round(tpg,3)) if tpg is not None else None))
        print("K", f"y{yc:+.2f} z{zc:.2f} sv{sv} pt{pt} -> maxdepth {maxd:.3f} cnt {cnt} gap {mo:.3f} touch(guy) {res[-1][-1]}")
if mode == "knee":
    gE, groot = guy_pose("guy_flinch", 0)
    snap = {"pelvis": (-2,0,3), "spine_01": (0,0,0), "spine_02": (10,0,0), "spine_03": (14,0,0), "neck_01": (-10,0,0), "head": (-6,0,2)}
    for yc, zc, pu, fl in itertools.product([-0.10,-0.08,-0.06,-0.04], [0.82,0.85,0.88], [6,12,18], [150]):
        C = CL.g2w((0.0, yc, zc))
        P = Pose(spine=snap, root=(0,0,0),
            feet={"l": {"ball": [0.10,-0.40,0.012], "pitch": -38, "yaw": 8, "pole": (0.25,-1,0.4)}},
            knee={"side": "r", "cap": list(C), "pitch_up": pu, "flex": fl, "point": 50, "cap_off": 0.05, "z_follow": 0.6})
        maxd, cnt, mo, tp = measure(P, gE, groot)
        tpg = CL.w2g(np.array(tp)) if tp is not None else None
        print("N", f"y{yc:+.2f} z{zc:.2f} pu{pu} -> maxdepth {maxd:.3f} cnt {cnt} gap {mo:.3f} touch(guy) {tuple(np.round(tpg,3)) if tpg is not None else None}")
if mode == "kickseq":
    import json as _j
    spec = _j.loads(argv[1])
    for nm, g, gi, yc, zc, sv, pt in spec:
        gE, groot = guy_pose(g, gi)
        C = CL.g2w((0.0, yc, zc))
        P = Pose(spine={"pelvis": (2,0,4), "spine_01": (-4,0,0), "spine_02": (-5,0,-1), "spine_03": (-3,0,0), "neck_01": (3,0,0), "head": (8,0,2)},
            root=(0,0,0), feet={"l": {"ball": [0.10,-0.30,0.012], "pitch": -26, "yaw": 10, "pole": (0.25,-1,0.3)}},
            kick2={"side": "r", "contact": list(C), "shin_from_vert": sv, "s": 1.0, "point": pt, "surf": 0.04})
        maxd, cnt, mo, tp = measure(P, gE, groot)
        print("S", nm, g, gi, f"y{yc:+.2f} z{zc:.2f} sv{sv} pt{pt} -> maxdepth {maxd:.3f} cnt {cnt} gap {mo:.3f}")
def guy_from_action(actname, fr):
    a = bpy.data.actions[actname]
    for fc in a.fcurves:
        bn = fc.data_path.split('"')[1]; pb = garm.pose.bones[bn]
        v = fc.evaluate(fr)
        if fc.data_path.endswith("rotation_quaternion"): pb.rotation_quaternion[fc.array_index] = v
        else: pb.location[fc.array_index] = v
def measure2(Pr):
    E, root = solve(Rr, Pr)
    apply(rarm, Rr, E, root)
    bpy.context.view_layer.update()
    hv=[]; hp=[]
    for o in his_parts:
        vs,ps=eval_mesh(o); off=len(hv); hv+=vs; hp+=[tuple(i+off for i in p) for p in ps]
    bvh = BVHTree.FromPolygons(hv, hp)
    maxd=0; cnt=0; mind_out=9
    for o in her_parts:
        vs,_ = eval_mesh(o)
        for v in vs:
            if v.z > 1.1 or v.y > -0.2: continue
            loc, nrm, idx, d = bvh.find_nearest(v)
            if loc is None or d > 0.3: continue
            if (v - loc).dot(nrm) < 0:
                if d < 0.15: cnt += 1; maxd = max(maxd, d)
            elif d < mind_out: mind_out = d
    return maxd, cnt, mind_out
if mode == "autofit":
    spec = json.load(open(argv[1]))
    out = {}
    base_spine = {"pelvis": (2,0,4), "spine_01": (-4,0,0), "spine_02": (-5,0,-1), "spine_03": (-3,0,0), "neck_01": (3,0,0), "head": (8,0,2)}
    for item in spec["frames"]:
        f = item["f"]; guy_act, gfr = item["guy"]
        guy_from_action(guy_act, gfr)
        best = None
        for dy in item.get("dys", [-0.03,0,0.03]):
            for dz in item.get("dzs", [-0.03,0,0.03]):
                for dsv in item.get("dsvs", [-6,0,6]):
                    y = item["y"] + dy; z = item["z"] + dz; sv = item["sv"] + dsv
                    C = CL.g2w((0.0, y, z))
                    if spec["kind"] == "kick":
                        P = Pose(spine=base_spine, root=(0,0,0), feet={"l": {"ball": [0.10,-0.30,0.012], "pitch": -26, "yaw": 10, "pole": (0.25,-1,0.3)}},
                            kick2={"side": "r", "contact": list(C), "shin_from_vert": sv, "s": 1.0, "point": 40, "surf": 0.04})
                    else:
                        P = Pose(spine={"pelvis": (-2,0,3), "spine_01": (0,0,0), "spine_02": (10,0,0), "spine_03": (14,0,0), "neck_01": (-10,0,0), "head": (-6,0,2)}, root=(0,0,0),
                            feet={"l": {"ball": [0.10,-0.40,0.012], "pitch": -38, "yaw": 8, "pole": (0.25,-1,0.4)}},
                            knee={"side": "r", "cap": list(C), "pitch_up": sv, "flex": 150, "point": 50, "cap_off": 0.05, "z_follow": 0.6})
                    maxd, cnt, gap = measure2(P)
                    want_touch = item.get("touch", False)
                    cost = 40*maxd + 0.02*cnt/100 + 1.0*(abs(dy)+abs(dz)) + 0.004*abs(dsv) + (3.0*max(0, gap-0.006) if want_touch else 0)
                    if best is None or cost < best[0]: best = (cost, y, z, sv, maxd, cnt, gap)
        out[str(f)] = {"y": best[1], "z": best[2], "sv": best[3]}
        print("FIT", spec["kind"], f, "y%.3f z%.3f sv%.1f maxd %.3f cnt %d gap %.3f" % best[1:])
    json.dump(out, open(spec["out"], "w"))
