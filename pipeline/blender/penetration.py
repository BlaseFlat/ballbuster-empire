import bpy, json, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index("--")+1:]
rb, gb, jobs = argv[0], argv[1], json.load(open(argv[2]))
bpy.ops.wm.open_mainfile(filepath=rb)
sc = bpy.context.scene
with bpy.data.libraries.load(gb, link=False) as (src, dst):
    dst.objects = [n for n in src.objects]; dst.actions = [n for n in src.actions]
for o in dst.objects:
    if o: sc.collection.objects.link(o)
rarm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Rusana")][0]
garm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Guy")][0]
garm.location = (0, jobs["guy_m"], 0); garm.rotation_euler = (0, 0, math.pi)
def setpose(arm, actname, fr):
    a = bpy.data.actions[actname]
    for fc in a.fcurves:
        bn = fc.data_path.split('"')[1]; pb = arm.pose.bones[bn]
        v = fc.evaluate(fr)
        if fc.data_path.endswith("rotation_quaternion"): pb.rotation_quaternion[fc.array_index] = v
        else: pb.location[fc.array_index] = v
for pb in list(rarm.pose.bones)+list(garm.pose.bones): pb.rotation_mode='QUATERNION'
def eval_mesh(o):
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg); m = e.to_mesh()
    vs = [o.matrix_world @ v.co for v in m.vertices]
    polys = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear()
    return vs, polys
her_parts = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Rusana") and ("body" in o.name or "shoes" in o.name or "shorts" in o.name)]
his_parts = [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith("Guy") and ("body" in o.name or "pants" in o.name)]
for job in jobs["frames"]:
    setpose(rarm, job["rus"], job["rf"]); setpose(garm, job["guy"], job["gf"])
    bpy.context.view_layer.update()
    hv=[]; hp=[]
    for o in his_parts:
        vs,ps=eval_mesh(o); off=len(hv); hv+=vs; hp+=[tuple(i+off for i in p) for p in ps]
    bvh = BVHTree.FromPolygons(hv, hp)
    # her vertices: only right leg region (x<0.05 and z<1.0 and y< -0.2) (Rusana right leg is -x)
    worst = []; count = 0; gaps = []
    for o in her_parts:
        vs,_ = eval_mesh(o)
        for v in vs:
            if v.z > 1.05 or v.y > -0.15: continue
            loc, nrm, idx, d = bvh.find_nearest(v)
            if loc is None or d > 0.25: continue
            inside = (v - loc).dot(nrm) < 0
            if inside:
                count += 1; worst.append((d, tuple(round(c,3) for c in v), o.name.split('_')[-1]))
            elif v.x < 0.06 and 0.6 < v.z < 1.0:
                gaps.append(d)
    worst.sort(reverse=True)
    print(f"PEN {job['rus']} f{job['rf']}: inside_verts={count} max_depth={worst[0][0] if worst else 0:.3f} at {worst[0][1:] if worst else ''} min_gap={min(gaps) if gaps else 9:.3f}")
