# render combined rus+guy frames. args: rus_blend guy_blend jobs_json
import bpy, json, sys, math
from mathutils import Vector, Euler
argv = sys.argv[sys.argv.index("--")+1:]
rb, gb, jobs = argv[0], argv[1], json.load(open(argv[2]))
bpy.ops.wm.open_mainfile(filepath=rb)
sc = bpy.context.scene
with bpy.data.libraries.load(gb, link=False) as (src, dst):
    dst.objects = [n for n in src.objects]
    dst.actions = [n for n in src.actions]
for o in dst.objects:
    if o: sc.collection.objects.link(o)
rarm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Rusana")][0]
garm = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith("Guy")][0]
GUY_M = jobs.get("guy_m", -0.74)
garm.location = (0, GUY_M, 0); garm.rotation_euler = (0, 0, math.pi)
for a in (rarm, garm):
    if not a.animation_data: a.animation_data_create()
    for t in a.animation_data.nla_tracks: t.mute = True
sc.render.engine = jobs.get("engine", 'BLENDER_EEVEE_NEXT')
if sc.render.engine == 'CYCLES':
    sc.cycles.samples = 12; sc.cycles.device='CPU'; sc.cycles.use_denoising = True
sc.render.resolution_x = jobs.get("w", 800); sc.render.resolution_y = jobs.get("h", 800)
world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.3, 0.3, 0.33, 1)
def light(name, loc, energy, size=2):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, -0.4, 1)) - o.location).to_track_quat('-Z', 'Y').to_euler()
light("key", (2.5, -3, 3.5), 800); light("fill", (-3, -2, 2), 300); light("rim", (0, 3, 3), 500)
# floor
bpy.ops.mesh.primitive_plane_add(size=8); fl = bpy.context.active_object
m = bpy.data.materials.new("floor"); m.use_nodes = True; m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.15, 0.15, 0.17, 1); fl.data.materials.append(m)
cam = bpy.data.cameras.new("C"); co = bpy.data.objects.new("C", cam); sc.collection.objects.link(co); sc.camera = co
for job in jobs["frames"]:
    rarm.animation_data.action = bpy.data.actions.get(job["rus"]) if job.get("rus") else None
    garm.animation_data.action = bpy.data.actions.get(job["guy"]) if job.get("guy") else None
    if not job.get("rus"):
        for pb in rarm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    # need separate frames: set rus frame via action frame offset trick -> use NLA-less eval with scene frame; guy frame via its own offset
    # evaluate: use action evaluation manually
    for arm, act, fr in ((rarm, job.get("rus"), job.get("rf", 0)), (garm, job.get("guy"), job.get("gf", 0))):
        if not act: continue
        a = bpy.data.actions[act]
        arm.animation_data.action = None
        for fc in a.fcurves:
            path = fc.data_path; idx = fc.array_index
            bn = path.split('"')[1]; pb = arm.pose.bones[bn]
            v = fc.evaluate(fr)
            if path.endswith("rotation_quaternion"): pb.rotation_quaternion[idx] = v
            else: pb.location[idx] = v
    bpy.context.view_layer.update()
    az = math.radians(job.get("az", 60)); el = math.radians(job.get("el", 8)); d = job.get("dist", 3.2)
    t = Vector(job.get("target", (0, -0.37, 0.85)))
    co.location = t + Vector((math.sin(az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, math.sin(el) * d))
    co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.lens = job.get("lens", 50)
    sc.render.filepath = job["out"]
    bpy.ops.render.render(write_still=True)
    print("RENDERED", job["out"])
