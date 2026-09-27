import bpy, json, sys, math
from mathutils import Quaternion, Vector
argv = sys.argv[sys.argv.index("--")+1:]
blend, animjson, outblend = argv[0], argv[1], argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.fps = 30
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
data = json.load(open(animjson))
if not arm.animation_data: arm.animation_data_create()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
for name, clip in data.items():
    act = bpy.data.actions.new(name); act.use_fake_user = True
    n = clip["n"]
    for bname, qs in clip["bones"].items():
        if bname not in arm.pose.bones: continue
        # skip constant identity bones
        if all(abs(q[0]-1) < 1e-5 for q in qs) and bname != "pelvis": continue
        dp = f'pose.bones["{bname}"].rotation_quaternion'
        fcs = [act.fcurves.new(dp, index=i, action_group=bname) for i in range(4)]
        for i in range(4):
            fcs[i].keyframe_points.add(n)
            fcs[i].keyframe_points.foreach_set("co", [v for f in range(n) for v in (f, qs[f][i])])
            for kp in fcs[i].keyframe_points: kp.interpolation = 'LINEAR'
    dp = 'pose.bones["pelvis"].location'
    for i in range(3):
        fc = act.fcurves.new(dp, index=i, action_group="pelvis")
        fc.keyframe_points.add(n)
        fc.keyframe_points.foreach_set("co", [v for f in range(n) for v in (f, clip["pelvis_loc"][f][i])])
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 0, act); tr.mute = True
arm.animation_data.action = None
bpy.ops.wm.save_as_mainfile(filepath=outblend)
print("BAKED", list(data.keys()))
