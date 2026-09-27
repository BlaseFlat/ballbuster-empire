import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index("--")+1:]
out = argv[0]
views = argv[1].split(",") if len(argv)>1 else ["front","side","q"]
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.render.resolution_x = 600; sc.render.resolution_y = 900
sc.render.film_transparent = False
world = bpy.data.worlds.new("W") if not sc.world else sc.world
sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.25,0.25,0.28,1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
# lights
def light(name, loc, energy, size=2):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    d = mathutils.Vector((0,0,1)) - o.location
    o.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
light("key", (2.5,-3,3), 600); light("fill", (-3,-2,2), 250); light("rim", (0,3,3), 400)
# bounds
zs=[]; 
for o in bpy.data.objects:
    if o.type=='MESH':
        for c in o.bound_box: zs.append((o.matrix_world @ mathutils.Vector(c)).z)
h = max(zs) if zs else 1.7
cam = bpy.data.cameras.new("C"); cam.lens = 70
co = bpy.data.objects.new("C", cam); sc.collection.objects.link(co); sc.camera = co
target = mathutils.Vector((0,0,h*0.5))
dist = h*3.2
angles = {"front":0, "side":90, "q":35, "back":180, "q2":-35}
for v in views:
    if v == "face":
        a = math.radians(15); t = mathutils.Vector((0,0,h*0.92)); d = 1.1
    else:
        a = math.radians(angles[v]); t = target; d = dist
    co.location = t + mathutils.Vector((math.sin(a)*d, -math.cos(a)*d, 0.05*d))
    co.rotation_euler = (t - co.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath = f"{out}_{v}.png"
    bpy.ops.render.render(write_still=True)
