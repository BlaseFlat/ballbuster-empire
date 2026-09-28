# Model beauty previews with fixed cameras (before/after comparisons).
# Renders the exported (pre-compression) GLB, i.e. exactly the materials the game gets.
# usage: blender -b --python model_preview.py -- <in.glb> <out_prefix> <height_m> <idle_action> [frame]
import bpy, sys, math, mathutils, os
argv = sys.argv[sys.argv.index("--")+1:]
glb, out, h, act = argv[0], argv[1], float(argv[2]), argv[3]
fr = int(argv[4]) if len(argv) > 4 else 0
HDR = "/workspace/bb3d-source/web/assets/hdri/gym_01_1k.hdr"
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
# match the game's material handling (web/js/character.js): COLOR_0 is a zone mask, never albedo;
# hair uses alphaTest 0.35
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    for n in [n for n in nt.nodes if n.type == 'VERTEX_COLOR']:
        for l in list(n.outputs['Color'].links) + list(n.outputs['Alpha'].links):
            sock = l.to_socket; nt.links.remove(l)
            try: sock.default_value = (1, 1, 1, 1) if len(sock.default_value) == 4 else (1, 1, 1)
            except TypeError: sock.default_value = 1.0
    if 'hair' in m.name.lower():
        bs = nt.nodes.get('Principled BSDF')
        al = bs.inputs['Alpha']
        if al.is_linked:
            src = al.links[0].from_socket
            gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.35
            nt.links.new(src, gt.inputs[0]); nt.links.new(gt.outputs[0], al)
if not arm.animation_data: arm.animation_data_create()
for t in arm.animation_data.nla_tracks: t.mute = True
arm.animation_data.action = bpy.data.actions.get(act) or next(a for a in bpy.data.actions if act in a.name)
sc.frame_set(fr + 1)
# kill root motion for identical framing
arm.location = (0, 0, 0)
bpy.context.view_layer.update()
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = int(os.environ.get("BB_SAMPLES", 64)); sc.cycles.use_denoising = True
sc.cycles.transparent_max_bounces = 128  # layered alpha hair cards: avoid black terminations
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'
world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes["Background"]
env = nt.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(HDR)
nt.links.new(env.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.6
# camera sees a neutral studio backdrop; lighting still comes from the game HDRI
lp = nt.nodes.new("ShaderNodeLightPath"); bg2 = nt.nodes.new("ShaderNodeBackground")
bg2.inputs["Color"].default_value = (0.045, 0.045, 0.05, 1); bg2.inputs["Strength"].default_value = 1.0
mix = nt.nodes.new("ShaderNodeMixShader"); out_n = nt.nodes["World Output"]
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(bg.outputs[0], mix.inputs[1]); nt.links.new(bg2.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out_n.inputs["Surface"])
def light(name, loc, energy, size=2, tgt=(0, 0, 1.0), col=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = col
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (mathutils.Vector(tgt) - o.location).to_track_quat('-Z', 'Y').to_euler()
light("key", (2.2, -3.0, 2.2), 450, 2.5, col=(1, 0.95, 0.88))
light("fill", (-3, -2.2, 1.6), 150, 3, col=(0.9, 0.95, 1))
light("rim", (-1.2, 3, 2.2), 300, 2)
bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.active_object
m = bpy.data.materials.new("floor"); m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.055, 1)
fl.data.materials.append(m)
cam = bpy.data.cameras.new("C"); co = bpy.data.objects.new("C", cam); sc.collection.objects.link(co); sc.camera = co
# glTF import: Y-up converted to Blender Z-up; character faces -Y
hb = arm.pose.bones["head"]
headc = arm.matrix_world @ hb.head + mathutils.Vector((0, 0, 0.10))
views = [("front", 0, 900, 1350), ("q", 35, 900, 1350), ("back", 160, 900, 1350), ("face", 15, 900, 900), ("face_q", 50, 900, 900)]
only = os.environ.get("BB_VIEWS")
for v, ang, W, H in views:
    if only and v not in only.split(","): continue
    sc.render.resolution_x = W; sc.render.resolution_y = H
    a = math.radians(ang)
    if v.startswith("face"):
        # face shots in rest pose (idle guard hides the face)
        arm.animation_data.action = None
        for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
        bpy.context.view_layer.update()
        hb = arm.pose.bones["head"]; headc = arm.matrix_world @ hb.head + mathutils.Vector((0, 0, 0.03 * h / 1.56))
        cam.lens = 85; d = 0.75 if h < 1.7 else 0.92; t = headc if h < 1.7 else headc + mathutils.Vector((0, 0, 0.015))
    else:
        cam.lens = 60; t = mathutils.Vector((0, 0, h * 0.5)); d = h * 2.55
    co.location = t + mathutils.Vector((math.sin(a) * d, -math.cos(a) * d, 0.04 * d))
    co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f"{out}_{v}.png"
    bpy.ops.render.render(write_still=True)
    print("RENDERED", sc.render.filepath)
